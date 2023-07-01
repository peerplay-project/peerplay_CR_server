import moment from "moment";
import { ForwarderType, ip_calculator_from_ip } from "../../../toolkit";
import { getClientFilter_EXTERNAL_USRV, sendBroadcast_EXTERNAL_USRV, sendTo_EXTERNAL_USRV } from "../entrypoints/external";
import { sendBroadcast_INTERSERVER_USRV, sendTo_INTERSERVER_USRV } from "../entrypoints/interserver";
import { getClientFilter_LOCAL_USRV, sendBroadcast_LOCAL_USRV, sendTo_LOCAL_USRV } from "../entrypoints/local";
const IPV4_OFF_SRC = 12;
const IPV4_OFF_DST = 16;
const IPV4FRAG_OFF_SRC = 0;
const IPV4FRAG_OFF_DST = 4;
const Timeout = 30 * 1000;
let count = 0
let log: string[] = []
class Node {
  node_type: string;
  address: string;
  constructor(node_type: string, address: string) {
    this.node_type = node_type;
    this.address = address;
  }
}

interface CacheItem {
  expireAt: number;
  node: Node;
}
let ipCache: Map<number, CacheItem> = new Map();


function clearRouterCacheItem<T extends number, U extends { expireAt: number }>(map: Map<T, U>) {
  const now = Date.now();
  for (const [key, { expireAt }] of map) {
    if (expireAt < now) {
      map.delete(key);
    }
  }
}

export function SLP_ROUTER(node: Node, source_filter: Buffer, payload: Buffer, Fragment: boolean) {
  if (payload.length <= 20) {
    // packet too short, ignore
    return;
  }
  let src;
  let dst;
  let src_str = ''
  let dst_str = ''
  let count = 0
  if (Fragment) {
    src = payload.readInt32BE(IPV4FRAG_OFF_SRC);
    dst = payload.readInt32BE(IPV4FRAG_OFF_DST);
    for (const x of payload.slice(IPV4FRAG_OFF_SRC, IPV4FRAG_OFF_SRC + 32).values()) {
      count++
      if (count <= 4) {
        src_str = src_str + x
        if (count !== 4) {
          src_str = src_str + '.'
        }
      }
    }
    count = 0
    for (const x of payload.slice(IPV4FRAG_OFF_DST, IPV4FRAG_OFF_DST + 32).values()) {
      count++
      if (count <= 4) {
        dst_str = dst_str + x
        if (count !== 4) {
          dst_str = dst_str + '.'
        }
      }
    }
  } else {
    src = payload.readInt32BE(IPV4_OFF_SRC);
    dst = payload.readInt32BE(IPV4_OFF_DST);
    for (const x of payload.slice(IPV4_OFF_SRC, IPV4_OFF_SRC + 32).values()) {
      count++
      if (count <= 4) {
        src_str = src_str + x
        if (count !== 4) {
          src_str = src_str + '.'
        }
      }
    }
    count = 0
    for (const x of payload.slice(IPV4_OFF_DST, IPV4_OFF_DST + 32).values()) {
      count++
      if (count <= 4) {
        dst_str = dst_str + x
        if (count !== 4) {
          dst_str = dst_str + '.'
        }
      }
    }
  }
  log.push(`${moment(Date.now()).format('DD/MM/YYYY HH:mm:ss')} || ${src_str}=>${dst_str} || Packet from ${src_str} to ${dst_str}`)
  ipCache.set(src, {
    node,
    expireAt: Date.now() + Timeout,
  });
  log.push(`${moment(Date.now()).format('DD/MM/YYYY HH:mm:ss')} || ${src_str}=>${dst_str} || Source : ${src_str} is hosted on ${node.address}, a ${node.node_type} NODE`)

  if (ipCache.has(dst)) {
    const { node } = ipCache.get(dst)!;
    log.push(`${moment(Date.now()).format('DD/MM/YYYY HH:mm:ss')} || ${src_str}=>${dst_str} || Destination : ${dst_str} is hosted on ${node.address}, a ${node.node_type} NODE`)
    redirect(node, Fragment, payload, source_filter, dst_str);
  } else {
    log.push(`${moment(Date.now()).format('DD/MM/YYYY HH:mm:ss')} || ${src_str}=>${dst_str} || Destination : ${dst_str} is unknown Starting Broadcast`)
    broadcast(node, Fragment, payload);
  }
}

export function clearExpire_SLP_ROUTER() {
  clearRouterCacheItem(ipCache)
  count++
  if (count < 500) {
    log = [];
    count = 0;
  }
}

function redirect(node: Node, Fragment: boolean, payload: Buffer, source_filter: Buffer, virtual_address: string) {
  const ip_identifier = ip_calculator_from_ip(virtual_address,'255.0.0.0')
  let Forwarder
  if (Fragment) {
    Forwarder = ForwarderType.Ipv4Frag
  }
  else {
    Forwarder = ForwarderType.Ipv4
  }
  // Source Filter Settings
  const source_networkType = source_filter.slice(9, 12).toString(); // NETWORK_TYPE est entre 9 et 12
  const source_connectType = source_filter.slice(12, 16).toString().split('\0')[0]; // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
  const source_password = source_filter.slice(17, 53).toString().split('\0')[0]; // PASSWORD est entre 13 et 52 et on enlève les zéros
  const source_pool = source_filter.slice(54, 90).toString().split('\0')[0]; // POOL est entre 52 et 90 et on enlève les zéros
  // Destination Filter Settings
  let destination_filter: Buffer;
  let destination_networkType: string;
  let destination_connectType: string;
  let destination_password: string;
  let destination_pool: string;
  switch (node.node_type) {
    case 'LOCAL':
      // Destination Filter Settings
      destination_filter = getClientFilter_LOCAL_USRV(ip_identifier)
      destination_networkType = destination_filter.slice(9, 12).toString(); // NETWORK_TYPE est entre 9 et 12
      destination_connectType = destination_filter.slice(12, 16).toString().split('\0')[0]; // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
      destination_password = destination_filter.slice(17, 53).toString().split('\0')[0]; // PASSWORD est entre 13 et 52 et on enlève les zéros
      destination_pool = destination_filter.slice(54, 90).toString().split('\0')[0]; // POOL est entre 52 et 90 et on enlève les zéros
      if (source_networkType === destination_networkType && source_connectType === destination_connectType && source_password === destination_password && source_pool === destination_pool) {
        console.log('Packet Validated by filter')
        sendTo_LOCAL_USRV(node.address, Forwarder, payload).then()
      }
      else {
      console.log('Packet refused by filter')
      console.log(`${source_networkType} / ${destination_networkType}`)
      console.log(`${source_connectType} / ${destination_connectType}`)
      console.log(`${source_password} / ${destination_password}`)
      console.log(`${source_pool} / ${destination_pool}`)
      console.log('--------------------------')
      }
      break;
    case 'EXTERNAL':
            // Destination Filter Settings
            destination_filter = getClientFilter_EXTERNAL_USRV(ip_identifier)
            destination_networkType = destination_filter.slice(9, 12).toString(); // NETWORK_TYPE est entre 9 et 12
            destination_connectType = destination_filter.slice(12, 16).toString().split('\0')[0]; // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
            destination_password = destination_filter.slice(17, 53).toString().split('\0')[0]; // PASSWORD est entre 13 et 52 et on enlève les zéros
            destination_pool = destination_filter.slice(54, 90).toString().split('\0')[0]; // POOL est entre 52 et 90 et on enlève les zéros
            if (source_networkType === destination_networkType && source_connectType === destination_connectType && source_password === destination_password && source_pool === destination_pool) {
              console.log('Packet Validated by filter')
              sendTo_EXTERNAL_USRV(node.address, Forwarder, payload).then()
            }
            else {
              console.log('Packet refused by filter')
              console.log(`${source_networkType} / ${destination_networkType}`)
              console.log(`${source_connectType} / ${destination_connectType}`)
              console.log(`${source_password} / ${destination_password}`)
              console.log(`${source_pool} / ${destination_pool}`)
              console.log('--------------------------')
              }
      break;
    case 'INTERSERVER':
      sendTo_INTERSERVER_USRV({ address: node.address, type: Forwarder, payload }, source_filter).then()
      break;
  }

}
function broadcast(node: Node, Fragment: boolean, payload: Buffer) {
  let Forwarder
  if (Fragment) {
    Forwarder = ForwarderType.Ipv4Frag
    switch (node.node_type) {
      case 'LOCAL':
        sendBroadcast_LOCAL_USRV(Forwarder, payload, node.address).then()
        sendBroadcast_EXTERNAL_USRV(Forwarder, payload).then()
        sendBroadcast_INTERSERVER_USRV(Forwarder, payload).then()
        break;
      case 'EXTERNAL':
        sendBroadcast_LOCAL_USRV(Forwarder, payload).then()
        sendBroadcast_EXTERNAL_USRV(Forwarder, payload, node.address).then()
        sendBroadcast_INTERSERVER_USRV(Forwarder, payload).then()
        break;
      case 'INTERSERVER':
        sendBroadcast_LOCAL_USRV(Forwarder, payload).then()
        sendBroadcast_EXTERNAL_USRV(Forwarder, payload).then()
        break;
    }
  }
  else {
    Forwarder = ForwarderType.Ipv4
    switch (node.node_type) {
      case 'LOCAL':
        sendBroadcast_LOCAL_USRV(Forwarder, payload, node.address).then()
        sendBroadcast_EXTERNAL_USRV(Forwarder, payload).then()
        sendBroadcast_INTERSERVER_USRV(Forwarder, payload).then()
        break;
      case 'EXTERNAL':
        sendBroadcast_LOCAL_USRV(Forwarder, payload).then()
        sendBroadcast_EXTERNAL_USRV(Forwarder, payload, node.address).then()
        sendBroadcast_INTERSERVER_USRV(Forwarder, payload).then()
        break;
      case 'INTERSERVER':
        sendBroadcast_LOCAL_USRV(Forwarder, payload).then()
        sendBroadcast_EXTERNAL_USRV(Forwarder, payload).then()
        break;
    }
  }
}

export function export_router_log() {
  return log
}
