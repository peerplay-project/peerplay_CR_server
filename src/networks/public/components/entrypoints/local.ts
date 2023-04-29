import { createSocket, AddressInfo } from "dgram";
import {
  ForwarderType,
  ForwarderTypeMap,
  Timeout,
  lookup6,
} from "../../../toolkit";
import { isString } from "util";
import { SLP_ROUTER } from "../routers/default";

class Peer {
  AddressInfo: AddressInfo;
  constructor(public rinfo: AddressInfo) {
    this.AddressInfo = rinfo;
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
  const rinfo: AddressInfo = {
    address: data[0],
    family: data[2],
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

function onPing(rinfo: AddressInfo, msg: Buffer) {
  sendToRaw(rinfo, msg.slice(0, 4));
}

function sendToRaw(addr: AddressInfo, msg: Buffer) {
  const { address, port } = addr;
  server.send(msg, port, address, (error) => {
    if (error) {
      manager.delete(addr);
    }
  });
}

function onPacket(peer: AddressInfo, type: ForwarderType, payload: Buffer) {
  switch (type) {
    case ForwarderType.Keepalive:
      break;
    case ForwarderType.Ipv4:
      SLP_ROUTER(
        { node_type: "LOCAL", address: addr2str(peer) },
        payload,
        false
      );
      break;
    case ForwarderType.Ipv4Frag:
      SLP_ROUTER(
        { node_type: "LOCAL", address: addr2str(peer) },
        payload,
        true
      );
      break;
  }
}

async function onMessage(msg: Buffer, rinfo: AddressInfo): Promise<void> {
  if (msg.byteLength === 0) {
    return;
  }

  const { type, isEncrypted } = parseHead(msg);
  if (type === ForwarderType.Ping && !isEncrypted) {
    return onPing(rinfo, msg);
  }

  const peer = manager.get(rinfo);
  let payload = msg.slice(1);
  onPacket(peer.AddressInfo, type, payload);
}

export function start_LOCAL_USRV(port: number) {
  server.bind(port);
}

export async function sendTo_LOCAL_USRV(
  address: string | AddressInfo,
  type: ForwarderType,
  payload: Buffer
) {
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

export async function sendBroadcast_LOCAL_USRV(
  type: ForwarderType,
  payload: Buffer,
  except?: string
) {
  if (except !== undefined) {
    const AddressInfo = str2addr(except);
    for (let peer of manager.all(AddressInfo)) {
      sendTo_LOCAL_USRV(peer.AddressInfo, type, payload).then();
    }
  } else {
    for (let peer of manager.all()) {
      sendTo_LOCAL_USRV(peer.AddressInfo, type, payload).then();
    }
  }
}

export function getClientSize_LOCAL_USRV() {
  return manager.size
}

export function clearExpire_LOCAL_USRV(){
  manager.clearExpire()
}
