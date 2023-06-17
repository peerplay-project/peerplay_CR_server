import { clearExpire_SLP_ROUTER, export_router_log } from "./components/routers/default";
import { clearExpire_EXTERNAL_USRV, getClientSize_EXTERNAL_USRV, start_EXTERNAL_USRV } from "./components/entrypoints/external";
import { clearExpire_LOCAL_USRV, getClientSize_LOCAL_USRV, start_LOCAL_USRV} from "./components/entrypoints/local";
import { clearExpire_INTERSERVER_USRV, getClientSize_INTERSERVER_USRV, start_INTERSERVER_USRV } from "./components/entrypoints/interserver";
import {PeerplayData} from "../../interface";
let server_info = {
  address: "",
  local: 0,
  interserver_local: 0,
  interserver_internet: 0,
  external_local: 0,
  external_internet: 0,
  minimal_port_range: 0
};

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
  ip_address: string,
  ip_filter: Buffer,
  method: string,
  network_type: string,
  password: string,
  pool: string,
  strict: boolean
) {
  // Actual Buffers
  const NETWORK_TYPE = ip_filter.slice(9, 12) // NETWORK_TYPE est entre 9 et 12
  const CONNECT_TYPE = ip_filter.slice(12, 16) // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
  const PASSWORD = ip_filter.slice(17, 53)// PASSWORD est entre 13 et 52 et on enlève les zéros
  const POOL = ip_filter.slice(54, 90) // POOL est entre 52 et 90 et on enlève les zéros
  switch (method) {
    case "NETWORK_TYPE":
      // Empty and Write Network Type Settings
      NETWORK_TYPE.fill(0);
      NETWORK_TYPE.write(network_type.slice(0, 3));
      break;
    case "GEOGRAPHIC_KEY":
      PASSWORD.fill(0);
      PASSWORD.write(password.slice(0, 36));
      break;
    case "PASSWORD_KEY":
      PASSWORD.fill(0);
      PASSWORD.write(password.slice(0, 36));
      break;
    case "POOL_KEY":
      POOL.fill(0);
      POOL.write(pool.slice(0, 36));
      break;
  }
  return true;
}
