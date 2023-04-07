import { createSocket, Socket, AddressInfo } from "dgram";
import {
  lookup6,
  ForwarderType,
  ForwarderTypeMap,
  Timeout,
} from "../../../toolkit";
import { isString } from "util";
import { SLP_ROUTER } from "../routers/default";
const PouchDB = require("pouchdb");
PouchDB.plugin(require("comdb"));
import { NodesTable } from "../../../../databases/DB_nodes/main";
let database = new PouchDB("DB_nodes");
interface peer_msg {
  msg: Buffer;
  server_origin: { address: string; port: number };
}

class Peer {
  AddressInfo: {
    address: string;
    port: number;
  };
  constructor(
    public peerinfo: {
      address: string;
      port: number;
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
  delete(rinfo: { address: string; port: number }) {
    return this.map.delete(addr2str(rinfo));
  }
  get(rinfo: { address: string; port: number }): Peer {
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
  *all(except?: { address: string; port: number }) {
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
server.on(
  "message",
  (
    msg: Buffer,
  ) => onMessage(msg)
);

function clearCacheItem<T, U extends { expireAt: number }>(map: Map<T, U>) {
  const now = Date.now();
  for (const [key, { expireAt }] of map) {
    if (expireAt < now) {
      map.delete(key);
    }
  }
}

function addr2str(rinfo: { address: string; port: number }) {
  return `${rinfo.address}/${rinfo.port}`;
}
function str2addr(str: string) {
  const data = str.split("/");
  const rinfo: {
    address: string;
    port: number;
  } = {
    address: data[0],
    port: Number(data[1]),
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

function sendToRaw(
  addr: {
    address: string;
    port: number;
  },
  msg: Buffer
) {
  const { address, port } = addr;
  const peer_msg = Buffer.from(
    JSON.stringify({
      msg,
      server_origin: {
        address: server_ip,
        port: server_port,
      },
    }),
    "utf-8"
  );
  server.send(peer_msg, port, address, (error, bytes) => {
    if (error) {
      manager.delete(addr);
    }
  });
}

function onPacket(
  peer: {
    address: string;
    port: number;
  },
  type: ForwarderType,
  payload: Buffer
) {
  switch (type) {
    case ForwarderType.Keepalive:
      break;
    case ForwarderType.Ipv4:
      SLP_ROUTER(
        { node_type: "INTERSERVER", address: addr2str(peer) },
        payload,
        false
      );
      break;
    case ForwarderType.Ipv4Frag:
      SLP_ROUTER(
        { node_type: "INTERSERVER", address: addr2str(peer) },
        payload,
        true
      );
      break;
  }
}

async function onMessage(
  Pmsg: Buffer,
): Promise<void> {
  const is_msg: peer_msg = JSON.parse(Pmsg.toString());
  if (is_msg.msg.byteLength === 0) {
    return;
  }
  const server_peer_info = {
    address: is_msg.server_origin.address,
    port: is_msg.server_origin.port,
  };
  const { type } = parseHead(is_msg.msg);
  const peer = manager.get(server_peer_info);
  let payload = is_msg.msg.slice(1);
  onPacket(peer.AddressInfo, type, payload);
}

export function start_INTERSERVER_USRV(ip: string, port: number, database_password: string) {
  server_ip = ip;
  server_port = port;
  db_password = database_password
  server.bind(port);
}

export async function sendTo_INTERSERVER_USRV(
{ address, type, payload }: {
  address: string |
  {
    address: string;
    port: number;
  }; type: ForwarderType; payload: Buffer;
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
  payload: Buffer,
) {
  database.setPassword(db_password).then(() => {
    database
      .allDocs({
        include_docs: true,
        attachments: true,
      })
      .then((results: { rows: any[]; }) => {
        results.rows.forEach((result) => {
          try {
            if (result.doc !== undefined) {
              // @ts-ignore : si une erreur se produit a cette endroit l'element sera simplement ignoré / non compté
              const node: NodesTable = result.doc as NodesTable;
              if (
                node.address !== server_ip &&
                node.interserver_port !== server_port
              ) {
                sendTo_INTERSERVER_USRV(
                {
                  address: {
                    address: node.address,
                    port: node.interserver_port,
                  }, type, payload
                }                );
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
    });
}

export function getClientSize_INTERSERVER_USRV() {
  return manager.size;
}

export function clearExpire_INTERSERVER_USRV() {
  manager.clearExpire();
}
