export const Timeout = 10 * 1000

export enum ForwarderType {
  Keepalive = 0,
  Ipv4 = 1,
  Ping = 2,
  Ipv4Frag = 3,
  Info = 0x10,
}
export const ForwarderTypeMap: Record<ForwarderType, Buffer> = {
  [ForwarderType.Keepalive]: Buffer.from([ForwarderType.Keepalive]),
  [ForwarderType.Ipv4]: Buffer.from([ForwarderType.Ipv4]),
  [ForwarderType.Ping]: Buffer.from([ForwarderType.Ping]),
  [ForwarderType.Ipv4Frag]: Buffer.from([ForwarderType.Ipv4Frag]),
  [ForwarderType.Info]: Buffer.from([ForwarderType.Info]),
};

export function lookup4(
  hostname: string,
  options: any,
  callback: (err: Error | null, address: string, family: number) => any
) {
  callback(null, hostname, 4);
}
export function lookup6(
  hostname: string,
  options: any,
  callback: (err: Error | null, address: string, family: number) => any
) {
  callback(null, hostname, 6);
}
