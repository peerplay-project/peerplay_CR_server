import { createSocket, AddressInfo } from "dgram";
import {
  lookup4,
  lookup6,
  ForwarderType,
  ForwarderTypeMap,
  Timeout,
} from "../../../toolkit";
import { isString } from "util";
import { SLP_ROUTER } from "../routers/default";
import { NodesTable } from "../../../../databases/DB_nodes/main";
import dns from 'dns';
import {
  PEERPLAY_HEADER,
  DASH,
  SLASH,
  PASSWORD,
  POOL,
  NETWORK_TYPE,
  CONNECT_TYPE,
  start_interface_syncronisation
} from "../../network";
const PouchDB = require("pouchdb");
const net = require("net");
let database = new PouchDB("DB_nodes");
class Peer {
  AddressInfo: AddressInfo
  constructor(
    public peerinfo: {
      address: string;
      port: number;
      family: string;
    }
  ) {
    this.AddressInfo = peerinfo;
  }
}

class PeerManager {
  protected map: Map<
    string,
    {
      expireAt: number;
      peer: Peer;
    }
  > = new Map();
  delete(rinfo: AddressInfo) {
    return this.map.delete(addr2str(rinfo));
  }
  get(rinfo: AddressInfo): Peer {
    const key = addr2str(rinfo);
    const map = this.map;
    const expireAt = Date.now() + Timeout;
    let i = map.get(key);
    if (i === undefined) {
      i = {
        expireAt,
        peer: new Peer(rinfo),
      };
      map.set(key, i);
    } else {
      i.expireAt = expireAt;
    }
    return i.peer;
  }
  clearExpire() {
    clearCacheItem(this.map);
  }
  get size() {
    return this.map.size;
  }
  *all(except?: AddressInfo) {
    if (except !== undefined) {
      const exceptStr = addr2str(except);
      for (let [key, { peer }] of this.map) {
        if (exceptStr === key) continue;
        yield peer;
      }
    } else {
      for (let [key, { peer }] of this.map) {
        yield peer;
      }
    }
  }
}
let server_ip = "";
let db_password = "";
let server_port = 0;
const manager: PeerManager = new PeerManager();
const server = createSocket({
  type: "udp6",
  lookup: lookup6,
});

server.on("error", (err) => onError(err));
server.on("close", () => onClose());
server.on("message", (msg: Buffer, rinfo: AddressInfo) =>
  onMessage(msg, rinfo)
);

function clearCacheItem<T, U extends { expireAt: number }>(map: Map<T, U>) {
  const now = Date.now();
  for (const [key, { expireAt }] of map) {
    if (expireAt < now) {
      map.delete(key);
    }
  }
}

function addr2str(rinfo: AddressInfo) {
  return `${rinfo.address}/${rinfo.port}/${rinfo.family}`;
}
function str2addr(str: string) {
  const data = str.split("/");
  const rinfo: {
    address: string;
    port: number;
    family: string;
  } = {
    address: data[0],
    port: Number(data[1]),
    family: data[2]
  };
  return rinfo;
}

function onError(err: Error) {
  console.log(`server error:\n${err.stack}`);
  server.close();
}
function onClose() {
  console.log(`server closed`);
}

function parseHead(msg: Buffer): {
  type: ForwarderType;
  isEncrypted: boolean;
} {
  const firstByte = msg.readUInt8(0);
  return {
    type: firstByte & 0x7f,
    isEncrypted: (firstByte & 0x80) !== 0,
  };
}

async function sendToRaw(
  addr: {
    address: string;
    port: number;
    family: string;
  },
  send_msg: Buffer
) {
  let { address, port } = addr;
  const patched_address = await convertIP(address);
  if ( patched_address !== undefined && net.isIPv6(patched_address) && port !== undefined) {
    //console.log("Packet to Send");
    // Send Data
    const send_header = Buffer.alloc(2);
    const send_filter = Buffer.concat([PEERPLAY_HEADER, NETWORK_TYPE,CONNECT_TYPE, DASH, PASSWORD, SLASH, POOL]);
    send_header.writeUInt16BE(server_port, 0);
    const send_peer_msg = Buffer.concat([send_header,send_filter, send_msg]);
    //console.log("Header : " + send_header.readUInt16BE(0).toString())
    //console.log("Peer Message : " + send_peer_msg.toJSON().data);
    //console.log("Original Message : " + send_msg.toJSON().data);
    // ==========
    // Calculate Received Packet
    // Extract Filter
    const filter = send_peer_msg.slice(2,92);
    const networkType = filter.slice(9, 12).toString(); // NETWORK_TYPE est entre 9 et 12
    const connectType = filter.slice(12, 16).toString().split('\0')[0]; // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
    const password = filter.slice(17,53).toString().split('\0')[0]; // PASSWORD est entre 13 et 52 et on enlève les zéros
    const pool = filter.slice(54, 90).toString().split('\0')[0]; // POOL est entre 52 et 90 et on enlève les zéros
    console.log("Network Type: '" + networkType +"-"+ connectType + "' | Password: '" + password + "' | Pool: '" + pool + "'");
    if (networkType === NETWORK_TYPE.slice(0, 3).toString() && connectType === CONNECT_TYPE.slice(0, 4).toString().split('\0')[0] && password === PASSWORD.slice(0, 36).toString().split('\0')[0] && pool === POOL.slice(0, 36).toString().split('\0')[0] && JSON.stringify(send_msg.toJSON()) === JSON.stringify(send_peer_msg.slice(92)))
    {
      server.send(send_peer_msg, 0, send_peer_msg.length, port, patched_address, (error, bytes) => {
        if (error) {
          manager.delete(addr);
          console.log(`Error in packet send` + error);
        } else {
          console.log("Packet Send");
        }
      });
  }else {
      console.log("Invalid Network Type or Password, or damaged packet : Abort Send");}
    }
  else
  {
    //console.log(`Invalid Destination Address :` + patched_address);
  }
}

function onPacket(
  peer: AddressInfo,
  type: ForwarderType,
  payload: Buffer
) {
  console.log("Packet Received for processing");
  switch (type) {
    case ForwarderType.Keepalive:
      console.log("Keepalive Packet Recieved: Ignore");
      break;
    case ForwarderType.Ipv4:
      console.log("IPV4 Packet Recieved: Send to Router");
      SLP_ROUTER(
        { node_type: "INTERSERVER", address: addr2str(peer) },
        payload,
        false
      );
      break;
    case ForwarderType.Ipv4Frag:
      console.log("IPV4 Fragment Packet Recieved: Send to Router");
      SLP_ROUTER(
        { node_type: "INTERSERVER", address: addr2str(peer) },
        payload,
        true
      );
      break;
  }
}

async function onMessage(peer_msg: Buffer, rinfo: AddressInfo): Promise<void> {
  //console.log("Message Received");
  // Extract Header
  const header = peer_msg.slice(0,2);
  const responsePort = header.readUInt16BE(0);
  // Extract Filter
  const filter = peer_msg.slice(2,92);
  const networkType = filter.slice(9, 12).toString(); // NETWORK_TYPE est entre 9 et 12
  const connectType = filter.slice(12, 16).toString().split('\0')[0]; // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
  const password = filter.slice(17,53).toString().split('\0')[0]; // PASSWORD est entre 13 et 52 et on enlève les zéros
  const pool = filter.slice(54, 90).toString().split('\0')[0]; // POOL est entre 52 et 90 et on enlève les zéros
  console.log("Network Type: '" + networkType +"-"+ connectType + "' | Password: '" + password + "' | Pool: '" + pool + "'");
  if (networkType === NETWORK_TYPE.slice(0, 3).toString() && connectType === CONNECT_TYPE.slice(0, 4).toString().split('\0')[0] && password === PASSWORD.slice(0, 36).toString().split('\0')[0] && pool === POOL.slice(0, 36).toString().split('\0')[0])
  {
    const msg = peer_msg.slice(92);
    if (msg.byteLength === 0) {
      return;
    }
    const { type } = parseHead(msg);
    const AddressInfo: AddressInfo = {address:rinfo.address, port:responsePort, family: rinfo.family}
    const peer = manager.get(AddressInfo);
    let payload = Buffer.from(msg).slice(1);
    console.log("Packet extracted and send to packet processor");
    onPacket(peer.AddressInfo, type, payload);
  }
  else
  {
    console.log("Network Type or Password Mismatch : Ignore Packet");
  }

}

export function start_INTERSERVER_USRV(
  ip: string,
  port: number,
  internet_port: number,
  database_password: string
) {

  server_ip = ip;
  server_port = internet_port;
  db_password = database_password;
  server.bind(port);
  start_interface_syncronisation()
}

export async function sendTo_INTERSERVER_USRV({
  address,
  type,
  payload,
}: {
  address:
    | string
    | {
        address: string;
        port: number;
        family: string;
      };
  type: ForwarderType;
  payload: Buffer;

}) {
  if (isString(address)) {
    const AddressInfo = str2addr(address);
    sendToRaw(
      AddressInfo,
      Buffer.concat([ForwarderTypeMap[type], payload], payload.byteLength + 1)
    );
  } else {
    sendToRaw(
      address,
      Buffer.concat([ForwarderTypeMap[type], payload], payload.byteLength + 1)
    );
  }

}


export async function sendBroadcast_INTERSERVER_USRV(
  type: ForwarderType,
  payload: Buffer
) {
  const ncrypt = require("ncrypt-js");
  const ncryptObject = new ncrypt(db_password);
  database
    .allDocs({
      include_docs: true,
      attachments: true,
    })
    .then((results: { rows: any[] }) => {
      results.rows.forEach((result) => {
        try {
          if (result.doc !== undefined) {
            // @ts-ignore : ignore all typescript errors
            const node: NodesTable = result.doc as NodesTable;
            if (
              ncryptObject.decrypt(node.address) !== server_ip &&
              node.interserver_port !== server_port
            ) {
              sendTo_INTERSERVER_USRV({
                address: {
                  address: ncryptObject.decrypt(node.address),
                  port: node.interserver_port,
                  family: "IPv6",
                },
                type,
                payload,
              });
            }
          }
        } catch (error) {
          // Do Nothing
        }
      });
    })
    .catch(function (err: any) {
      console.log(err);
    });
}

export function getClientSize_INTERSERVER_USRV() {
  return manager.size;
}

export function clearExpire_INTERSERVER_USRV() {
  manager.clearExpire();
}

async function convertIP(ip: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    console.log("Finding IP type");
    if (net.isIP(ip) === 4) {
      // Address is in IPv4 format
      const ipv6 = "::ffff:" + ip;
      console.log("IP is in IPv4 format, converting to IPv6");
      console.log(ip);
      console.log("IP converted to IPv6");
      console.log(ipv6);
      resolve(ipv6);
    } else if (net.isIP(ip) === 6) {
      // Address is in IPv6 format
      console.log("IP is already in IPv6 format, Returning IP");
      console.log(ip);
      resolve(ip);
    } else {
      // Address is not in IPv4 or IPv6 format, assuming it is a domain name
      console.log("IP is not in IPv4 or IPv6 format, Performing DNS lookup");

      dns.lookup(ip, (err, address) => {
        if (err) {
          console.log('DNS lookup error:', err);
          reject(err);
        } else {
          console.log("DNS lookup successful");
          console.log("Resolved IP:", address);
          if (net.isIP(address) === 4) {
            const ipv6 = "::ffff:" + address;
            console.log("Resolved IP is in IPv4 format, converting to IPv6");
            console.log(ipv6);
            resolve(ipv6);
          } else if (net.isIP(address) === 6) {
            console.log("Resolved IP is already in IPv6 format");
            resolve(address);
          } else {
            console.log("Resolved IP is not in IPv4 or IPv6 format");
            reject(new Error("Resolved IP is not in IPv4 or IPv6 format"));
          }
        }
      });
    }
  });
}
