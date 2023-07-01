import { createSocket, AddressInfo } from "dgram";
import {
  lookup6,
  ForwarderType,
  ForwarderTypeMap,
  Timeout,
  ip_calculator_from_ip,
} from "../../../toolkit";
import { isString } from "util";
import { SLP_ROUTER } from "../routers/default";

// Default Filter Settings
const PEERPLAY_HEADER = Buffer.alloc(9); // buffer de taille 9
PEERPLAY_HEADER.write("peerplay:");
const NETWORK_TYPE = Buffer.alloc(3); // buffer de taille 3
NETWORK_TYPE.write("ANY");
const CONNECT_TYPE = Buffer.alloc(4); // buffer de taille 3
CONNECT_TYPE.write("ANY");
const DASH = Buffer.alloc(1); // buffer de taille 1
DASH.write("-");
const PASSWORD = Buffer.alloc(36); // buffer de taille 36
PASSWORD.write("GEO_WORLD");
const SLASH = Buffer.alloc(1); // buffer de taille 1
SLASH.write("/");
const POOL = Buffer.alloc(36); // buffer de taille 36
POOL.fill("");
const default_filter = Buffer.concat([PEERPLAY_HEADER, NETWORK_TYPE,CONNECT_TYPE, DASH, PASSWORD, SLASH, POOL]);

class Filter {
  Filter: Buffer;
  expireAt: number;
  constructor(filter: Buffer) {
    this.Filter = filter;
    this.expireAt = Date.now() + Timeout;
  }
}

class FilterManager {
  protected map: Map<
    string,
    {
      expireAt: number;
      Filter: Buffer;
    }
  > = new Map();
  delete(ip_identifier: string) {
    return this.map.delete(ip_identifier);
  }
  get(ip_identifier: string): Filter {
    const map = this.map;
    const filterData: Filter | undefined = map.get(ip_identifier);
    if (filterData !== undefined) {
      filterData.expireAt = Date.now() + Timeout;
      return filterData;
    }
    else {
      map.set(ip_identifier, new Filter(default_filter));
      return new Filter(default_filter);
    }
  }
  clearExpire() {
    clearCacheItem(this.map);
  }
  find(ip_identifier: string,): { source: string, filter: Buffer } | undefined {
    const map = this.map;
    const filterData: Filter | undefined = map.get(ip_identifier);
    if (filterData !== undefined) {
      return {
        source: "EXTERNAL",
        filter: filterData.Filter,
      }
    }
    else {
      return undefined
    }
  }
  set(ip_identifier: string, new_filter: Buffer) {
    // Set New Filter
    const map = this.map;
    map.set(ip_identifier, new Filter(new_filter));
    if (map.get(ip_identifier)?.Filter === new_filter) {
      return true;
    }
  }
  all(): { identifier: string; filter: Buffer }[] {
    const allFilters: {
      identifier: string;
      filter: Buffer;
    }[] = [];

    for (let [key, { Filter }] of this.map) {
      allFilters.push({ identifier: key, filter: Filter });
    }
    return allFilters;
  }
}

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

const filter: FilterManager = new FilterManager();
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
      console.log(`EXTERNAL cleared ${key}`)
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
  let SOURCE_IP_BUFFER: Buffer;
  let ip_filter: Buffer;
  switch (type) {
    case ForwarderType.Keepalive:
      break;
    case ForwarderType.Ipv4:
      const IPV4_OFF_SRC = 12;
      SOURCE_IP_BUFFER = payload.slice(IPV4_OFF_SRC, IPV4_OFF_SRC + 32);
      ip_filter = filter.get(ip_calculator_from_ip(`${SOURCE_IP_BUFFER[0]}.${SOURCE_IP_BUFFER[1]}.${SOURCE_IP_BUFFER[2]}.${SOURCE_IP_BUFFER[3]}`,'255.0.0.0')).Filter
      SLP_ROUTER(
        { node_type: "EXTERNAL", address: addr2str(peer) },
        ip_filter,
        payload,
        false
      );
      break;
    case ForwarderType.Ipv4Frag:
      const IPV4_FRAG_OFF_SRC = 0;
      SOURCE_IP_BUFFER = payload.slice(IPV4_FRAG_OFF_SRC, IPV4_FRAG_OFF_SRC + 32);
      ip_filter = filter.get(ip_calculator_from_ip(`${SOURCE_IP_BUFFER[0]}.${SOURCE_IP_BUFFER[1]}.${SOURCE_IP_BUFFER[2]}.${SOURCE_IP_BUFFER[3]}`,'255.0.0.0')).Filter
      SLP_ROUTER(
        { node_type: "EXTERNAL", address: addr2str(peer) },
        ip_filter,
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

export function start_EXTERNAL_USRV(port: number) {
  server.bind(port);
}

export async function sendTo_EXTERNAL_USRV(
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

export async function sendBroadcast_EXTERNAL_USRV(
  type: ForwarderType,
  payload: Buffer,
  except?: string
) {
  if (except !== undefined) {
    const AddressInfo = str2addr(except);
    for (let peer of manager.all(AddressInfo)) {
      sendTo_EXTERNAL_USRV(peer.AddressInfo, type, payload).then();
    }
  } else {
    for (let peer of manager.all()) {
      sendTo_EXTERNAL_USRV(peer.AddressInfo, type, payload).then();
    }
  }
}

export function getClientFilter_EXTERNAL_USRV(ip_identifier: string)
{
  return filter.get(ip_identifier).Filter
}
export function findClientFilter_EXTERNAL_USRV(ip_identifier: string)
{
  return filter.find(ip_identifier)
}

export function getAllClientFilter_EXTERNAL_USRV() {
    return filter.all();
}

export function setClientFilter_EXTERNAL_USRV(
  ip_identifier: string,
  new_filter: {
    NETWORK_TYPE: Buffer;
    CONNECT_TYPE: Buffer;
    PASSWORD: Buffer;
    POOL: Buffer;
  }
) {
  let Filter = filter.find(ip_identifier);
  if (Filter !== undefined) {
    let new_password = new_filter.PASSWORD;
    let new_pool = new_filter.POOL;
    return filter.set(
      ip_identifier,
      Buffer.concat([
        PEERPLAY_HEADER,
        NETWORK_TYPE,
        CONNECT_TYPE,
        DASH,
        new_password,
        SLASH,
        new_pool,
      ]),
    );
  }
}
export function getClientSize_EXTERNAL_USRV() {
  return manager.size
}

export function clearExpire_EXTERNAL_USRV(){
  manager.clearExpire()
  filter.clearExpire()
}
