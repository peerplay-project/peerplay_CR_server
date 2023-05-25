import { clearExpire_SLP_ROUTER, export_router_log } from "./components/routers/default";
import { clearExpire_EXTERNAL_USRV, getClientSize_EXTERNAL_USRV, start_EXTERNAL_USRV } from "./components/entrypoints/external";
import { clearExpire_LOCAL_USRV, getClientSize_LOCAL_USRV, start_LOCAL_USRV} from "./components/entrypoints/local";
import { clearExpire_INTERSERVER_USRV, getClientSize_INTERSERVER_USRV, start_INTERSERVER_USRV } from "./components/entrypoints/interserver";
import {PeerplayData} from "../../interface";
import ora from "ora-classic";
const network = require('network');
let server_info = {
  address: "",
  local: 0,
  interserver_local: 0,
  interserver_internet: 0,
  external_local: 0,
  external_internet: 0,
  minimal_port_range: 0
};

// Interserver Password is Used for Filter Interserver Packet for Create Sub Network
// peerplay:<network_type>-<password>
// <network_type> :
// - ANY : Accept All Network Type (Optical Fiber / ADSL / Mobile (4G, 5G)
// - NT1 : Accept Only Optical Fiber Network
// - NT2 : Accept Only ADSL Network
// - NT3 : Accept Only Mobile Network (4G, 5G)
// <password> : Password for Filter Packet (Use a Global or Private Password)
// = Global Network Password
// - WORLD : Accept All Packet
// - US : Accept Only Packet from United States
// - EU : Accept Only Packet from Europe
// - AS : Accept Only Packet from Asia
//Peerplay Send and Recieve Buffers
export const PEERPLAY_HEADER = Buffer.alloc(9); // buffer de taille 9
PEERPLAY_HEADER.write("peerplay:");
export const NETWORK_TYPE = Buffer.alloc(3); // buffer de taille 3
NETWORK_TYPE.write("ANY");
export const CONNECT_TYPE = Buffer.alloc(4); // buffer de taille 3
CONNECT_TYPE.write("ANY");
export let strict_mode = false
export const DASH = Buffer.alloc(1); // buffer de taille 1
DASH.write("-");
export const PASSWORD = Buffer.alloc(36); // buffer de taille 36
PASSWORD.write("WORLD");
export const SLASH = Buffer.alloc(1); // buffer de taille 1
SLASH.write("/");
export const POOL = Buffer.alloc(36); // buffer de taille 36
POOL.fill("");

// Console Types is Used for Calculate Total Client Size
const console_types = 7

export function start_USRV(
  PeerplayData: PeerplayData
) {
  const custom_spin = {
    interval: 100,
    frames: ["◜", "◝", "◞", "◟"],
  };
  // Start All UDP Servers
  server_info = {
    address: PeerplayData.ip,
    local: PeerplayData.LocalPortNum,
    interserver_local: PeerplayData.InterserverPortNum,
    interserver_internet: PeerplayData.InterserverPortNum + PeerplayData.MinimalPortRange,
    external_local: PeerplayData.ExternalPortNum,
    external_internet: PeerplayData.ExternalPortNum + PeerplayData.MinimalPortRange,
    minimal_port_range: PeerplayData.MinimalPortRange
  };
  start_LOCAL_USRV(PeerplayData.LocalPortNum);
  start_EXTERNAL_USRV(PeerplayData.ExternalPortNum);
  start_INTERSERVER_USRV(server_info.address,server_info.interserver_local,server_info.interserver_internet,PeerplayData.DatabasePassword);
  const ora = require("ora-classic");
  if (process.env.NODE_ENV === "production") {
    const spinner = ora("");
    spinner.spinner = custom_spin;
    spinner.start();
    setInterval(() => {
      clearExpire_SLP_ROUTER();
      clearExpire_LOCAL_USRV();
      clearExpire_EXTERNAL_USRV();
      clearExpire_INTERSERVER_USRV();
      const server_size = get_server_size();
      spinner.text = ` Peerplay: Running\n    [Network Repartition] :\n      - Total: ${server_size.total_clients}\n      - Local: ${server_size.local_clients}\n      - External: ${server_size.external_clients}\n      - Interserver: ${server_size.interserver_clients}\n`;
    }, 1000);
  }
}
export function get_server_info() {
  return server_info;
}

export function get_server_size() {
  const local = getClientSize_LOCAL_USRV() / console_types;
  const external = getClientSize_EXTERNAL_USRV() / console_types;
  const interserver = getClientSize_INTERSERVER_USRV() / console_types;
  return {
    total_clients: local + external + interserver,
    local_clients: local,
    external_clients: external,
    interserver_clients: interserver,
  };
}
export function get_router_log(){
  return export_router_log()
}

export function change_filter_settings(
  method: string,
  network_type: string,
  password: string,
  pool: string,
  strict: boolean
) {
  switch (method) {
    case "NETWORK_TYPE":
      // Empty and Write Network Type Settings
      NETWORK_TYPE.fill(0);
      NETWORK_TYPE.write(network_type.slice(0, 3));
      return true;
      break;
    case "GEOGRAPHIC_KEY":
      PASSWORD.fill(0);
      PASSWORD.write(password.slice(0, 36));
      return true;
      break;
    case "PASSWORD_KEY":
      PASSWORD.fill(0);
      PASSWORD.write(password.slice(0, 36));
      return true;
      break;
    case "POOL_KEY":
      POOL.fill(0);
      POOL.write(pool.slice(0, 36));
      return true;
      break;
    case "STRICT_MODE":
      strict_mode = strict
      return true;
      break;
  }
  return true;
}

export async function start_interface_syncronisation() {
  while (true)  {
    await setActiveInterface()
    await new Promise((resolve) =>
      setTimeout(resolve, 5 * 1000)
    );
  }
}
export function getActiveInterfaceType() {
  return new Promise((resolve, reject) => {
    network.get_active_interface((err: any, obj: unknown) => {
      if (err) {
        reject(err);
      } else {
        // @ts-ignore
        resolve(obj.type);
      }
    });
  });
}
export async function setActiveInterface() {
  if (strict_mode === false) {
    CONNECT_TYPE.fill(0);
    CONNECT_TYPE.write("ANY");
    return null
  } else {
  const active_interface = await getActiveInterfaceType();
  if (active_interface === "Wired") {
    CONNECT_TYPE.fill(0);
    CONNECT_TYPE.write("ETH");
  } else if (active_interface === "Wireless") {
    CONNECT_TYPE.fill(0);
    CONNECT_TYPE.write("WLAN");
  } else {
    // DO NOTHING
  }
  return null
  }
}

export function get_filter_settings() {
  return {
    network_type: NETWORK_TYPE.toString(),
    password: PASSWORD.toString().split('\0')[0],
    pool: POOL.toString().split('\0')[0],
    strict_mode: strict_mode
  };
}
