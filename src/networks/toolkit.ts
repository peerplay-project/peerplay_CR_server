export const Timeout = 5 * 1000
export let JWT_SECRET = ''
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
// Lookup functions
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
// JWT functions
export function setJwtSecret(newSecret: string) {
  JWT_SECRET = newSecret;
}

// IP Calculators
export function ip_calculator_from_position(position: number, firstIP: string, lastIP: string, subnetMask: string): string|undefined {
  const firstIPParts = firstIP.split('.').map(Number);
  const lastIPParts = lastIP.split('.').map(Number);
  const subnetMaskParts = subnetMask.split('.').map(Number);

  const totalIPs = (lastIPParts[3] - firstIPParts[3] + 1) * Math.pow(2, 24) / subnetMaskParts[3];

  if (position < 1 || position > totalIPs) {
    return undefined;
  }

  const uniqueIPParts = [
    firstIPParts[0] + Math.floor((firstIPParts[1] + Math.floor((firstIPParts[2] + Math.floor((firstIPParts[3] + position - 1) / 256)) / 256)) / 256),
    (firstIPParts[1] + Math.floor((firstIPParts[2] + Math.floor((firstIPParts[3] + position - 1) / 256)) / 256)) % 256,
    (firstIPParts[2] + Math.floor((firstIPParts[3] + position - 1) / 256)) % 256,
    (firstIPParts[3] + position - 1) % 256
  ];

  return uniqueIPParts
    .map((part, index) => (subnetMaskParts[index] === 255) ? '' : part.toString())
    .filter(part => part !== '') // Retirer les parties vides
    .join('.');
}

export function ip_calculator_from_ip(ip: string, subnetMask: string): string {
  const ipParts = ip.split('.').map(Number);
  const subnetMaskParts = subnetMask.split('.').map(Number);

  const dynamicIPParts = ipParts.map((part, index) => part & ~subnetMaskParts[index]);

  return dynamicIPParts.slice(1).join('.');
}

// Network Quality
// Dépendances spécifiques pour chaque catégorie
export const uploadDependencies = [
  { threshold: 1, quality: 5 },
  { threshold: 5, quality: 4 },
  { threshold: 10, quality: 3 },
  { threshold: 20, quality: 2 },
  { threshold: Infinity, quality: 1 },
];

export const downloadDependencies = [
  { threshold: 1, quality: 5 },
  { threshold: 5, quality: 4 },
  { threshold: 10, quality: 3 },
  { threshold: 20, quality: 2 },
  { threshold: Infinity, quality: 1 },
];

export const pingDependencies = [
  { threshold: 15, quality: 1 },
  { threshold: 30, quality: 2 },
  { threshold: 100, quality: 3 },
  { threshold: 150, quality: 4 },
  { threshold: Infinity, quality: 5  },
];

export const jitterDependencies = [
  { threshold: 5, quality: 1 },
  { threshold: 10, quality: 2 },
  { threshold: 20, quality: 3 },
  { threshold: 30, quality: 4 },
  { threshold: Infinity, quality: 5 },
];

export function split_filter(filter: Buffer){
  const networkType = filter.slice(9, 12); // NETWORK_TYPE est entre 9 et 12
  const connectType = filter.slice(12, 16); // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
  const password = filter.slice(17, 53); // PASSWORD est entre 13 et 52 et on enlève les zéros
  const pool = filter.slice(54, 90); // POOL est entre 52 et 90 et on enlève les zéros
  return { NETWORK_TYPE: networkType, CONNECT_TYPE: connectType, PASSWORD: password, POOL: pool };
}