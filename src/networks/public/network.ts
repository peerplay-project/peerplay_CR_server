import { clearExpire_SLP_ROUTER, export_router_log } from "./components/routers/default";
import { clearExpire_EXTERNAL_USRV, getClientSize_EXTERNAL_USRV, start_EXTERNAL_USRV } from "./components/entrypoints/external";
import { clearExpire_LOCAL_USRV, getClientSize_LOCAL_USRV, start_LOCAL_USRV} from "./components/entrypoints/local";
import { getClientSize_INTERSERVER_USRV, start_INTERSERVER_USRV } from "./components/entrypoints/interserver";
let server_info = {
  address: "",
  local: 0,
  interserver: 0,
  external: 0,
};

const console_types = 11 * 2

export function start_USRV(
  ip: string,
  LocalPortNum: number,
  InterserverPortNum: number,
  ExternalPortNum: number,
  MinimalPortRange: number,
  DatabasePassword: string
) {
  const custom_spin = {
    interval: 100,
    frames: ["◜", "◝", "◞", "◟"],
  };
  // Start All UDP Servers
  server_info = {
    address: ip,
    local: LocalPortNum,
    interserver: InterserverPortNum + MinimalPortRange,
    external: ExternalPortNum + MinimalPortRange,
  };
  start_LOCAL_USRV(LocalPortNum);
  start_EXTERNAL_USRV(ExternalPortNum);
  start_INTERSERVER_USRV(ip,InterserverPortNum, DatabasePassword);
  const ora = require("ora-classic");
  const spinner = ora("");
  spinner.spinner = custom_spin;
  spinner.start();
  setInterval(() => {
    clearExpire_SLP_ROUTER();
    clearExpire_LOCAL_USRV();
    clearExpire_EXTERNAL_USRV();
    const server_size = get_server_size();
    spinner.text = ` Peerplay: Running\n    [Network Repartition] :\n      - Total: ${server_size.total_clients}\n      - Local: ${server_size.local_clients}\n      - External: ${server_size.external_clients}\n      - Interserver: ${server_size.interserver_clients}\n`;
  }, 1000);
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
