import { Listr, ListrTaskWrapper } from "listr2";
import chalk from "chalk";
import { PeerplayData } from "../interface";

interface arg {
  port: number;
  port_range: number;
  task: ListrTaskWrapper<any, any>;
  description: string;
}

interface upnpConfigInterface {
  interserver: {
    TCP: boolean;
    UDP: boolean;
  };
  external: {
    TCP: boolean;
    UDP: boolean;
  };
  database: {
    TCP: boolean;
    UDP: boolean;
  };
  API: {
    TCP: boolean;
    UDP: boolean;
  };
  refreshrate: number;
}

let upnpConfig = {
  interserver: {
    TCP: false,
    UDP: false,
  },
  external: {
    TCP: false,
    UDP: false,
  },
  database: {
    TCP: false,
    UDP: false,
  },
  API: {
    TCP: false,
    UDP: false,
  },
  refreshrate: 5,
};
let description: any[] = [];

export const openPortTask = new Listr(
  [
    {
      title: "Trying to Open Interserver Port",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        const result = await openPort({
          port: PeerplayData.InterserverPortNum,
          port_range: PeerplayData.MinimalPortRange,
          task: task,
          description: "Peerplay : Interserver",
        });
        upnpConfig.interserver = result.upnp_settings;
        task.title = result.upnp_config_results.title;
        task.output = result.upnp_config_results.output;
        if (result.upnp_config_results.status === "warning") {
          ctx.warning_messages.push(
            "UPNP/INTERSERVER : " + result.upnp_config_results.output
          );
        }
        if (result.upnp_config_results.status === "error") {
          ctx.error_messages.push(
            "UPNP/INTERSERVER : " + result.upnp_config_results.output
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      },
    },

    {
      title: "Trying to Open External Port",

      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        if (PeerplayData.ExternalPortNum == 0) {
          upnpConfig.external = { TCP: false, UDP: false };
          description.push("Peerplay : External", "Peerplay : External");
          task.title = chalk.gray(
            "Trying to Open External Port - Port Not Specified"
          );
          task.skip();
        } else {
          const result = await openPort({
            port: PeerplayData.ExternalPortNum,
            port_range: PeerplayData.MinimalPortRange,
            task: task,
            description: "Peerplay : External",
          });
          upnpConfig.external = result.upnp_settings;
          task.title = result.upnp_config_results.title;
          task.output = result.upnp_config_results.output;
          if (result.upnp_config_results.status === "warning") {
            ctx.warning_messages.push(
              "UPNP/EXTERNAL : " + result.upnp_config_results.output
            );
          }
          if (result.upnp_config_results.status === "error") {
            ctx.error_messages.push(
              "UPNP/EXTERNAL : " + result.upnp_config_results.output
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      },
    },
    {
      title: "Trying to Open Database Port",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        if (PeerplayData.ExternalPortNum == 0) {
          upnpConfig.external = { TCP: false, UDP: false };
          description.push("Peerplay : External", "Peerplay : External");
          task.title = chalk.gray(
            "Trying to Open API Port - External Server Disabled"
          );
          task.skip();
        } else {
          const result = await openPort({
            port: PeerplayData.DatabasePortNum,
            port_range: PeerplayData.MinimalPortRange,
            task: task,
            description: "Peerplay : Database",
          });
          upnpConfig.database = { UDP: false, TCP: result.upnp_settings.TCP };
          task.title = result.upnp_config_results.title;
          task.output = result.upnp_config_results.output;
          if (result.upnp_config_results.status === "warning") {
            ctx.warning_messages.push(
              "UPNP/DATABASE : " + result.upnp_config_results.output
            );
          }
          if (result.upnp_config_results.status === "error") {
            ctx.error_messages.push(
              "UPNP/DATABASE : " + result.upnp_config_results.output
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      },
    },
    {
      title: "Trying to Open API Port",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        const result = await openPort({
          port: PeerplayData.PublicAPIPort,
          port_range: PeerplayData.MinimalPortRange,
          task: task,
          description: "Peerplay : API",
        });
        upnpConfig.API = { UDP: false, TCP: result.upnp_settings.TCP };
        task.title = result.upnp_config_results.title;
        task.output = result.upnp_config_results.output;
        if (result.upnp_config_results.status === "warning") {
          ctx.warning_messages.push(
            "UPNP/API : " + result.upnp_config_results.output
          );
        }
        if (result.upnp_config_results.status === "error") {
          ctx.error_messages.push(
            "UPNP/API : " + result.upnp_config_results.output
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      },
    },
    {
      title: "Persisting UPNP for opened ports",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        UpnpKeeper(PeerplayData, upnpConfig).then();
        task.title = chalk.green(task.title + " [OK]");
      },
    },
  ],
  { concurrent: false }
);

const ipAddressChecker = (check: string) => {
  let result = false;
  Object.values(require("os").networkInterfaces()).forEach((types) => {
    if (Array.isArray(types)) {
      types.forEach((net_interface) => {
        if (net_interface.address === check) {
          result = true;
        }
      });
    }
  });
  return result;
};

const mappingTCPOrUDP = (results: any[], Port: number, tcpOrUdp: string) => {
  return results.find(
    (result: any) =>
      result.private.port === Port &&
      result.protocol === tcpOrUdp &&
      result.enabled === true &&
      ipAddressChecker(result.private.host)
  );
};

const clientPortMapping = (
  Port: number,
  MinimalPortRange: number,
  tcpOrUdp: string,
  description: string
) => {
  return {
    public: Port + MinimalPortRange,
    private: Port,
    protocol: tcpOrUdp,
    description: description,
    ttl: 10,
  };
};

const openPortResult = async (
  stringValue: string,
  color: chalk.Chalk,
  args: arg
) => {
  const output = stringValue;
  let color_title = "";
  switch (color) {
    case chalk.green:
      color_title = color(args.task.title + " [OK]");
      return { title: color_title, output: output, status: "success" };
    case chalk.yellow:
      color_title = color(args.task.title + " [WARNING]");
      return { title: color_title, output: output, status: "warning" };
    case chalk.red:
      color_title = color(args.task.title + " [ERROR]");
      return { title: color_title, output: output, status: "errors" };
    default:
      return { title: color_title, output: output, status: "unknown" };
  }
};

const verifyPortMapping = async (results: any, args: arg, err: any) => {
  let portCheckResult;
  let mappingUDP = await mappingTCPOrUDP(results, args.port, "udp");
  let mappingTCP = await mappingTCPOrUDP(results, args.port, "tcp");
  if (mappingUDP !== undefined && mappingTCP !== undefined && err === null) {
    portCheckResult = {
      upnp_settings: { UDP: true, TCP: true },
      message: `Port ${args.port} (UDP and TCP) is open on UPNP`,
      color: chalk.green,
      args: args,
    };
  } else if (mappingUDP !== undefined && err === null) {
    portCheckResult = {
      upnp_settings: { UDP: true, TCP: false },
      message: `Port ${args.port} (UDP Only) is open on UPNP`,
      color: chalk.yellow,
      args: args,
    };
  } else if (err === null) {
    portCheckResult = {
      upnp_settings: { UDP: false, TCP: false },
      message: `Unable to find UPNP Mapping`,
      color: chalk.red,
      args: args,
    };
  } else {
    portCheckResult = {
      upnp_settings: { UDP: false, TCP: false },
      message: `Failed to check UPnP port mappings: ${err}`,
      color: chalk.red,
      args: args,
    };
  }
  return portCheckResult;
};

const openPort = async (args: arg) => {
  // try open tcp and udp port
  try {
    const natUpnp = require("nat-upnp");
    const client = natUpnp.createClient();
    description.push(args.description, args.description);

    await Promise.all([
      client.portMapping(
        clientPortMapping(args.port, args.port_range, "UDP", args.description)
      ),
      client.portMapping(
        clientPortMapping(args.port, args.port_range, "TCP", args.description)
      ),
    ]);
    // verify port is correctly open
    const getMappings = () => {
      return new Promise((resolve, reject) => {
        client.getMappings(function (err: any, results: any) {
          if (err) {
            reject(err);
          } else {
            resolve({ err, results });
          }
        });
      });
    };
    const result = (await getMappings()) as Promise<{ err: any; results: any }>;
    const result2 = await verifyPortMapping(
      (
        await result
      ).results,
      args,
      (
        await result
      ).err
    );
    const openPortResults = await openPortResult(
      result2.message,
      result2.color,
      result2.args
    );
    return {
      upnp_settings: result2.upnp_settings,
      upnp_config_results: {
        title: openPortResults.title,
        output: openPortResults.output,
        status: openPortResults.status,
      },
    };
  } catch (err) {
    const output = `Failed to open port`;
    return {
      upnp_settings: { TCP: false, UDP: false },
      upnp_config_results: {
        title: chalk.red(args.task.title + " [ERROR]"),
        output: output,
        status: "error",
      },
    };
  }
};

const UpnpKeeper = async (
  PeerplayData: PeerplayData,
  UpnpConfig: upnpConfigInterface
) => {
  const natUpnp = require("nat-upnp");
  const client = natUpnp.createClient();

  const upnpConfigList = {
    check: [
      upnpConfig.interserver.TCP,
      upnpConfig.interserver.UDP,
      upnpConfig.external.TCP,
      upnpConfig.external.UDP,
      upnpConfig.database.TCP,
      upnpConfig.database.UDP,
      upnpConfig.API.TCP,
      upnpConfig.API.UDP,
    ],
    peerPlayPort: [
      PeerplayData.InterserverPortNum,
      PeerplayData.InterserverPortNum,
      PeerplayData.ExternalPortNum,
      PeerplayData.ExternalPortNum,
      PeerplayData.DatabasePortNum,
      PeerplayData.DatabasePortNum,
      PeerplayData.PublicAPIPort,
      PeerplayData.PublicAPIPort,
    ],
    tcpOrUdp: ["TCP", "UDP", "TCP", "UDP", "TCP", "UDP", "TCP", "UDP"],
  };
  const stage = [0, 1, 2, 3, 4, 5, 6, 7];
  let exception = false;
  while (!exception) {
    try {
      for (const number of stage) {
        if (upnpConfigList.check[number]) {
          await client.portMapping(
            clientPortMapping(
              upnpConfigList.peerPlayPort[number],
              PeerplayData.MinimalPortRange,
              upnpConfigList.tcpOrUdp[number],
              description[number]
            )
          );
        }
      }
    } catch (error) {
      exception = true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, UpnpConfig.refreshrate * 1000)
    );
  }
};
