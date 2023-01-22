import { createSocket, Socket, AddressInfo } from 'dgram'
import { randomFill as randomFillAsync } from 'crypto'
const randomFill = (buf: Buffer, offset: number) => new Promise((res, rej) => randomFillAsync(buf, offset, (err, buf) => {
  if (err) {
    return rej(err)
  }
  res(buf)
}))
const Timeout = 30 * 1000
const IPV4_OFF_SRC = 12
const IPV4_OFF_DST = 16
const OutputEncrypt = false
interface SLPServerPort {
  ip: any,local: number, external: number, interserver: number
}
enum ForwarderType {
  Keepalive = 0,
  Ipv4 = 1,
  Ping = 2,
  Ipv4Frag = 3,
  Info = 0x10,
}
const ForwarderTypeMap: Record<ForwarderType, Buffer> = {
  [ForwarderType.Keepalive]: Buffer.from([ForwarderType.Keepalive]),
  [ForwarderType.Ipv4]: Buffer.from([ForwarderType.Ipv4]),
  [ForwarderType.Ping]: Buffer.from([ForwarderType.Ping]),
  [ForwarderType.Ipv4Frag]: Buffer.from([ForwarderType.Ipv4Frag]),
  [ForwarderType.Info]: Buffer.from([ForwarderType.Info]),
}

interface CacheItem {
  expireAt: number
  peer: Peer
}
function clearCacheItem<T, U extends { expireAt: number }>(map: Map<T, U>) {
  const now = Date.now()
  for (const [key, { expireAt }] of map) {
    if (expireAt < now) {
      map.delete(key)
    }
  }
}

function addr2str(rinfo: peer_info, ppinfo: string) {
  return `${ppinfo}/${rinfo.client_origin.address}:${rinfo.client_origin.port}`
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((res, rej) => {
    promise.then(res, rej)
    setTimeout(() => rej(new Error('Timeout')), ms)
  })
}

function lookup4(hostname: string, options: any, callback: (err: Error | null, address: string, family: number) => any) {
  callback(null, hostname, 4)
}
function lookup6(hostname: string, options: any, callback: (err: Error | null, address: string, family: number) => any) {
  callback(null, hostname, 6)
}

class User {
  key?: string
  constructor(public username: string) { }
}

class Peer {
  constructor(public peer_info: peer_info) { }
}

interface peer_info {
  node_type: string,
  client_origin: { address: string, port: number }, // IP du Client Lan Play d'Origine
  server_origin?: { address: string, port: number, type: string } // IP du Relais Peerplay Utilisé (Si Relais)
}
interface peer_msg {
  msg: Buffer
  client_origin: { address: string, port: number }
  server_origin: { address: string, port: number, type: string }
}

class PeerManager {
  protected map: Map<string, {
    expireAt: number
    peer: Peer
  }> = new Map()
  delete(peer_info: peer_info) {
    if (peer_info.node_type === 'SERVER' && peer_info.server_origin !== undefined) {
      return this.map.delete(addr2str(peer_info, `${peer_info.server_origin.address}:${peer_info.server_origin.port}`))
    }
    else {
      return this.map.delete(addr2str(peer_info, peer_info.node_type))
    }
  }
  get(peer_info: peer_info): Peer {
    var key: string
    if (peer_info.node_type === 'SERVER' && peer_info.server_origin !== undefined) {
      key = addr2str(peer_info, `${peer_info.server_origin.address}:${peer_info.server_origin.port}`)
    }
    else {
      key = addr2str(peer_info, peer_info.node_type)
    }
    const map = this.map
    const expireAt = Date.now() + Timeout
    let i = map.get(key)
    if (i === undefined) {
      i = {
        expireAt,
        peer: new Peer(peer_info)
      }
      map.set(key, i)
    } else {
      i.expireAt = expireAt
    }
    return i.peer
  }
  clearExpire() {
    clearCacheItem(this.map)
  }
  get size() {
    let local_size = 0
    let external_size = 0
    let server_size = 0
    this.map.forEach(client => {
      switch (client.peer.peer_info.node_type) {
        case 'LOCAL':
          local_size++
          break
        case 'EXTERNAL':
          external_size++
          break
        case 'SERVER':
          server_size++
          break
      }
    });
    return {
      total_clients: this.map.size,
      local_clients: local_size,
      external_clients: external_size,
      interserver_clients: server_size,
    }
  }
  *all(except: peer_info) {
    const exceptStr = addr2str(except, '')
    for (let [key, { peer }] of this.map) {
      if (exceptStr === key) continue
      yield peer
    }
  }
}

export class SLPServer {
  protected slp_ports: SLPServerPort
  protected local_socket: Socket
  protected external_socket: Socket
  protected interserver_socket: Socket
  protected ipCache: Map<number, CacheItem> = new Map()
  protected manager: PeerManager = new PeerManager()
  protected byteLastSec = {
    upload: 0,
    download: 0
  }
  protected listeners: number
  constructor(ip: any, local_port: number, external_port: number, interserver_port: number) {
    this.listeners = 0
    this.slp_ports = { ip: ip, local: local_port, external: external_port, interserver: interserver_port }
    // Local Socket : Used for Client on LAN/Localhost (Client <-Local/LAN-> Server)
    const local_socket = createSocket({
      type: 'udp6',
      lookup: lookup6
    })
    local_socket.on('error', (err) => this.onError(err, 'local'))
    local_socket.on('close', () => this.onClose('local'))
    local_socket.on('message', (msg: Buffer, rinfo: AddressInfo) => this.onMessage(msg, rinfo, 'LOCAL'))
    local_socket.bind(local_port)
    this.local_socket = local_socket
    this.listeners = this.listeners + 1

    // External Socket : Used for Client Connected From Internet (Client <-CS-> Server)
    const external_socket = createSocket({
      type: 'udp6',
      lookup: lookup6
    })
    external_socket.on('error', (err) => this.onError(err, 'external'))
    external_socket.on('close', () => this.onClose('external'))
    external_socket.on('message', (msg: Buffer, rinfo: AddressInfo) => this.onMessage(msg, rinfo, 'EXTERNAL'))
    if (external_port !== 0) {
      external_socket.bind(external_port) //If external_port is equal to 0 the socket is disabled (because he doesn't listen)
      this.listeners = this.listeners + 1
    }
    this.external_socket = external_socket

    // Interserver Socket : Used for Client from other Servers (Client <-Local/LAN/CS-> Server1 <-IS-> Server2)
    const interserver_socket = createSocket({
      type: 'udp6',
      lookup: lookup6
    })
    interserver_socket.on('error', (err) => this.onError(err, 'interserver'))
    interserver_socket.on('close', () => this.onClose('interserver'))
    interserver_socket.on('message', (Pmsg: Buffer) => this.onISMessage(Pmsg))
    interserver_socket.bind(interserver_port)
    this.interserver_socket = interserver_socket
    this.listeners = this.listeners + 1
    setInterval(() => {
      const history = `Active Console: ${this.manager.size.total_clients} | Bandwidth : upload: ${this.byteLastSec.upload / 1000}KB/s download: ${this.byteLastSec.download / 1000}KB/s)`
      this.byteLastSec.upload = 0
      this.byteLastSec.download = 0
      this.clearExpire()
    }, 1000)
  }

  public getClientSize() {
    return this.manager.size
  }
  public getSLPPort(){
    return this.slp_ports
  }
  protected parseHead(msg: Buffer): {
    type: ForwarderType,
    isEncrypted: boolean,
  } {
    const firstByte = msg.readUInt8(0)
    return {
      type: firstByte & 0x7f,
      isEncrypted: (firstByte & 0x80) !== 0,
    }
  }
  async onMessage(msg: Buffer, rinfo: AddressInfo, ctype: string): Promise<void> {
    if (msg.byteLength === 0) {
      return
    }
    this.byteLastSec.download += msg.byteLength
    const client_peer_info = {
      node_type: ctype,
      client_origin: { address: rinfo.address, port: rinfo.port }
    }
    const { type, isEncrypted } = this.parseHead(msg)
    if (type === ForwarderType.Ping && !isEncrypted) {
      return this.onPing(client_peer_info, msg)
    }
    const peer = this.manager.get(client_peer_info)
    let payload = msg.slice(1)
    this.onPacket(peer, type, payload)
  }
  async onISMessage(Pmsg: Buffer): Promise<void> {
    const is_msg: peer_msg = JSON.parse(Pmsg.toString())

    if (is_msg.msg.byteLength === 0) {
      return
    }
    this.byteLastSec.download += is_msg.msg.byteLength
    const server_peer_info = {
      node_type: "SERVER",
      client_origin: { address: is_msg.client_origin.address, port: is_msg.client_origin.port },
      server_origin: { address: is_msg.server_origin.address, port: is_msg.server_origin.port, type: is_msg.server_origin.type },
    }
    const { type, isEncrypted } = this.parseHead(is_msg.msg)
    if (type === ForwarderType.Ping && !isEncrypted) {
      return this.onPing(server_peer_info, is_msg.msg)
    }
    const peer = this.manager.get(server_peer_info)
    let payload = is_msg.msg.slice(1)
    this.onPacket(peer, type, payload)
  }
  onPacket(peer: Peer, type: ForwarderType, payload: Buffer) {
    switch (type) {
      case ForwarderType.Keepalive:
        break
      case ForwarderType.Ipv4:
        this.onIpv4(peer, payload)
        break
      case ForwarderType.Ping:
        console.error('never reach here')
        break
      case ForwarderType.Ipv4Frag:
        this.onIpv4Frag(peer, payload)
        break
    }
  }
  protected sendInfo(peer: Peer, info: string) {
    this.sendTo(peer, ForwarderType.Info, Buffer.from(info))
  }
  onIpv4Frag(peer: Peer, payload: Buffer) {
    if (payload.length <= 20) { // packet too short, ignore
      return
    }
    const src = payload.readInt32BE(0)
    const dst = payload.readInt32BE(4)
    this.ipCache.set(src, {
      peer,
      expireAt: Date.now() + Timeout
    })
    if (this.ipCache.has(dst)) {
      const dst_peer = this.ipCache.get(dst)!.peer
      this.sendTo(dst_peer, ForwarderType.Ipv4Frag, payload,peer.peer_info)
    } else {
      this.sendBroadcast(peer, ForwarderType.Ipv4Frag, payload)
    }
  }
  onPing(peer_info: peer_info, msg: Buffer) {
    this.sendToRaw(peer_info, msg.slice(0, 4))
  }
  onIpv4(peer: Peer, payload: Buffer) {
    if (payload.length <= 20) { // packet too short, ignore
      return
    }
    const src = payload.readInt32BE(IPV4_OFF_SRC)
    const dst = payload.readInt32BE(IPV4_OFF_DST)

    this.ipCache.set(src, {
      peer,
      expireAt: Date.now() + Timeout
    })
    if (this.ipCache.has(dst)) {
      const dst_peer = this.ipCache.get(dst)!.peer
      this.sendTo(dst_peer, ForwarderType.Ipv4, payload,peer.peer_info)
    } else {
      this.sendBroadcast(peer, ForwarderType.Ipv4, payload)
    }
  }
  onError(err: Error, socket: string) {
    console.log(`${socket} error:\n${err.stack}\n`)

    switch (socket) {
      case 'local':
        this.local_socket.close()
        this.listeners = this.listeners - 1
        break
      case 'external':
        this.external_socket.close()
        this.listeners = this.listeners - 1
        break
      case 'interserver':
        this.interserver_socket.close()
        this.listeners = this.listeners - 1
        break
    }
  }
  onSendError(error: Error, bytes: number) {
    console.error(`onSendError ${error} ${bytes}`)
  }
  onClose(socket: string) {
    console.log(`${socket} socket closed`)
  }
  sendTo({ peer_info }: Peer, type: ForwarderType, payload: Buffer,origin?: peer_info) {
    if (OutputEncrypt) {
      console.warn('not implement')
    }
    this.sendToRaw(peer_info, Buffer.concat([ForwarderTypeMap[type], payload], payload.byteLength + 1), origin)
  }
  sendToRaw(addr: peer_info, msg: Buffer, origin?: peer_info) {
    switch (addr.node_type) {
      case 'LOCAL':
        this.byteLastSec.upload += msg.byteLength
        this.local_socket.send(msg, addr.client_origin.port, addr.client_origin.address, (error, bytes) => {
          if (error) {
            this.manager.delete(addr)
          }
        })
        break
      case 'EXTERNAL':
        this.byteLastSec.upload += msg.byteLength
        this.external_socket.send(msg, addr.client_origin.port, addr.client_origin.address, (error, bytes) => {
          if (error) {
            this.manager.delete(addr)
          }
        })
        break
      case 'SERVER':
        if (addr.server_origin !== undefined) {
          if (origin === undefined){
            const peer_msg = {
              msg,
              client_origin: { address: addr.client_origin.address, port: addr.client_origin.port },
              server_origin: { address: addr.server_origin.address, port: addr.server_origin.port, type: addr.server_origin.type }
            }
          }
          else
          {
            let server_type: string
            if (this.slp_ports.external === 0){
              server_type = 'CLIENT'
            }
            else
            {
              server_type = 'RELAY'
            }
            const peer_msg = {
              msg,
              client_origin: { address: origin.client_origin.address, port: origin.client_origin.port },
              server_origin: { address: this.slp_ports.ip, port: this.slp_ports.interserver, type: server_type }
            }
          }
        }
    }
  }
  sendBroadcast(except: Peer, type: ForwarderType, payload: Buffer) {
    for (let peer of this.manager.all(except.peer_info)) {
      this.sendTo(peer, type, payload,except.peer_info)
    }
  }
  clearExpire() {
    this.manager.clearExpire()
    clearCacheItem(this.ipCache)
  }
}
