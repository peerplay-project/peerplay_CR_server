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
  send_msg: Buffer,
  send_filter: Buffer
) {
  let { address, port } = addr;
  const patched_address = await convertIP(address);
  if (patched_address !== undefined && net.isIPv6(patched_address) && port !== undefined) {
    const send_header = Buffer.alloc(2);
    send_header.writeUInt16BE(server_port, 0);
    const send_peer_msg = Buffer.concat([send_header, send_filter, send_msg]);
    server.send(send_peer_msg, 0, send_peer_msg.length, port, patched_address, (error, bytes) => {
      if (error) {
        manager.delete(addr);
        console.log(`Error in packet send` + error);
      } else {
      }
    });
  } else {
    console.log("Invalid Network Type or Password, or damaged packet : Abort Send");
  }
}

function onPacket(
  peer: AddressInfo,
  type: ForwarderType,
  filter: Buffer,
  payload: Buffer
) {
  switch (type) {
    case ForwarderType.Keepalive:
      break;
    case ForwarderType.Ipv4:
      SLP_ROUTER(
        { node_type: "INTERSERVER", address: addr2str(peer) },
        filter,
        payload,
        false
      );
      break;
    case ForwarderType.Ipv4Frag:
      SLP_ROUTER(
        { node_type: "INTERSERVER", address: addr2str(peer) },
        filter,
        payload,
        true
      );
      break;
  }
}

async function onMessage(peer_msg: Buffer, rinfo: AddressInfo): Promise<void> {
  //console.log("Message Received");
  // Extract Header
  const header = peer_msg.slice(0, 2);
  const responsePort = header.readUInt16BE(0);
  // Extract Filter
  const filter = peer_msg.slice(2, 92);
  const msg = peer_msg.slice(92);
  if (msg.byteLength === 0) {
    return;
  }
  const { type } = parseHead(msg);
  const AddressInfo: AddressInfo = { address: rinfo.address, port: responsePort, family: rinfo.family }
  const peer = manager.get(AddressInfo);
  let payload = Buffer.from(msg).slice(1);
  onPacket(peer.AddressInfo, type, filter, payload);
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

}, source_filter: Buffer) {
  if (isString(address)) {
    const AddressInfo = str2addr(address);
    sendToRaw(
      AddressInfo,
      Buffer.concat([ForwarderTypeMap[type], payload], payload.byteLength + 1),
      source_filter
    );
  } else {
    sendToRaw(
      address,
      Buffer.concat([ForwarderTypeMap[type], payload], payload.byteLength + 1),
      source_filter
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
              const emptyFilter = Buffer.alloc(90);
              emptyFilter.fill(0);
              sendTo_INTERSERVER_USRV({
                address: {
                  address: ncryptObject.decrypt(node.address),
                  port: node.interserver_port,
                  family: "IPv6",
                },
                type,
                payload,
              },
                emptyFilter);
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
    if (net.isIP(ip) === 4) {
      // Address is in IPv4 format
      const ipv6 = "::ffff:" + ip;
      resolve(ipv6);
    } else if (net.isIP(ip) === 6) {
      // Address is in IPv6 format
      resolve(ip);
    } else {
      // Address is not in IPv4 or IPv6 format, assuming it is a domain name
      dns.lookup(ip, (err, address) => {
        if (err) {
          reject(err);
        } else {
          if (net.isIP(address) === 4) {
            const ipv6 = "::ffff:" + address;
            resolve(ipv6);
          } else if (net.isIP(address) === 6) {
            resolve(address);
          } else {
            reject(new Error("Resolved IP is not in IPv4 or IPv6 format"));
          }
        }
      });
    }
  });
}
