import chalk from "chalk";
import { Listr } from "listr2";
import { PeerplayData } from "./interface";
import { getPublicIpTask } from "./tasks/getPublicIpTask";
import { openPortTask } from "./tasks/openPortTask";
import { verifyAccessTask } from "./tasks/verifyAccessTask";
import { startingPeerplayComponents } from "./tasks/startingPeerplayComponents";
import { ascii_art, database_password } from "./environment";
let boot_error: string[] = [];
let boot_warning: string[] = [];
interface Ctx {
  peerplay_data: PeerplayData;
  warning_messages: string[];
  error_messages: string[];
}
interface error_pack {
  code: string;
  description: string;
  solutions: string[];
}
const tasks = new Listr(
  [
    {
      title: "Starting Process",
      task: (ctx: Ctx, task) => {
        return new Listr([
          {
            title: chalk.italic("Obtaining and Set Public IP"),
            task: (ctx: Ctx, task) => {
              if (ctx.peerplay_data.ip !== "") {
                task.title =
                  chalk.italic("Obtaining and Set Public IP") +
                  chalk.gray(" - Already defined by user");
                task.skip();
              } else {
                return new Listr(getPublicIpTask.task, { concurrent: false });
              }
            },
          },
          {
            title: chalk.italic("Trying to open ports with UPNP"),
            task: (ctx: Ctx, task) => {
              return new Listr(openPortTask.task, { concurrent: false });
            },
          },
          {
            title: chalk.italic("Verify if Ports is opened"),
            task: (ctx: Ctx, task) => {
              return new Listr(verifyAccessTask.task, { concurrent: false });
            },
          },
          {
            title: chalk.italic("Starting Peerplay Components"),
            task: (ctx: Ctx, task) => {
              return new Listr(startingPeerplayComponents.task, {
                concurrent: false,
              });
            },
          },
        ]);
      },
    },
    {
      title: "Checking Status of Application",
      task: (ctx: Ctx, task) => {
        if (
          ctx.warning_messages.length === 0 &&
          ctx.error_messages.length === 0
        ) {
          task.title = chalk.green("Checked Status of Application : OK");
          return;
        }
        if (ctx.error_messages.length >> 0) {
          task.title = chalk.red(
            "Checked Status of Application : Errors Found"
          );
          boot_error = ctx.error_messages;
          return;
        }
        if (ctx.warning_messages.length >> 0) {
          boot_warning = ctx.warning_messages;
          if (ctx.error_messages.length === 0) {
            task.title = chalk.yellow(
              "Checked Status of Application : Warnings Found"
            );
          }
          return;
        }
      },
    },
  ],
  { exitOnError: true, rendererOptions: { collapse: false } }
);

function parseArgs2Obj(args: string[]) {
  let argsObj: any = {};
  for (let i = 0; i < args.length; i += 2) {
    let key: string = args[i];
    let value: string = args[i + 1];
    if (key.startsWith("--")) {
      argsObj[key.slice(2)] = value;
    }
  }
  return argsObj;
}

async function main(argv: string[]) {
  let argsObj = parseArgs2Obj(argv);
  const uuid = argsObj.uuid;
  const domain_name = argsObj.domain_name || "";
  const SlpExternalServer = argsObj.open_external_server || false;
  const MinimalPortRange = parseInt(argsObj.minimal_port_range || 0);
  let ExternalPortNum = parseInt(argsObj.external_server_port || 5984);
  const DatabaseSyncLimit = parseInt(argsObj.database_sync_limit || 20);
  const DatabasePassword = argsObj.database_password || database_password;
  const CustomDatabaseList = argsObj.custom_database_list || [];
  const PublicAPIPort = 5985;
  const PrivateAPIPort = 5986;
  const LocalPortNum = 5981;
  const InterserverPortNum = 5982;
  const DatabasePortNum = 5983;
  if (SlpExternalServer === false) {
    ExternalPortNum = 0;
  }
  console.log(ascii_art);
  console.log("CR_SERVER - Version 1.0.0");
  console.log(
    "CR_SERVER - Peerplay Relay Server (Based on Lan Play Server (Node) by spacemeowx2)"
  );
  console.log(
    "Improved by MH13 (adding P2P connection and database sync with other servers)"
  );
  console.log("");
  if (DatabasePassword !== "") {
    let custom_database_list: string[] = []
    if (typeof CustomDatabaseList === 'string'){
      CustomDatabaseList.split(',').forEach((element) => {
        custom_database_list.push(element);
      });
    }
    else
    {
      custom_database_list = CustomDatabaseList;
    }
    const PeerplayData: PeerplayData = {
      // Peerplay Config
      uuid: uuid,
      ip: domain_name,
      PublicAPIPort: PublicAPIPort,
      PrivateAPIPort: PrivateAPIPort,
      LocalPortNum: LocalPortNum,
      ExternalPortNum: ExternalPortNum,
      InterserverPortNum: InterserverPortNum,
      DatabasePortNum: DatabasePortNum,
      MinimalPortRange: MinimalPortRange,
      DatabaseSyncLimit: DatabaseSyncLimit,
      DatabasePassword: DatabasePassword,
      CustomDatabaseList: custom_database_list,
    };
    await tasks
      .run({
        peerplay_data: PeerplayData,
        warning_messages: [],
        error_messages: [],
      })
      .catch((err: Error) => {
        let error_causes: error_pack[] = [];
        console.error(chalk.red.underline("A Fatal Error Occured"));
        console.error("Cause : " + err.message);
        switch (err.message) {
          case chalk.red.underline("Obtaining and Set Public IP [FATAL_ERROR]"):
            error_causes = Obtain_Public_IP_Failed(tasks.ctx);
            break;
          case chalk.red.underline("Verify Interserver Port [FATAL_ERROR]"):
            error_causes = Verify_Port_Failed(
              tasks.ctx,
              "INTERSERVER",
              tasks.ctx.peerplay_data.InterserverPortNum
            );
            break;
          case chalk.red.underline("Verify External Port [FATAL_ERROR]"):
            error_causes = Verify_Port_Failed(
              tasks.ctx,
              "EXTERNAL",
              tasks.ctx.peerplay_data.ExternalPortNum
            );
            break;
          case chalk.red.underline("Verify Database Port [FATAL_ERROR]"):
            error_causes = Verify_Port_Failed(
              tasks.ctx,
              "DATABASE",
              tasks.ctx.peerplay_data.DatabasePortNum
            );
            break;
        }
        error_causes.forEach((error) => {
          console.log("- Origin      : " + error.code);
          console.log("  Description : " + error.description);
          error.solutions.forEach((solutions: String) => {
            console.log("  Solution    : " + solutions);
          });
        });
        process.exit(5);
      });
    if (boot_error.length !== 0) {
      console.error(chalk.red("Standard Errors: " + boot_error.length));
      boot_error.forEach((error) => {
        console.error(error);
      });
    }
    if (boot_warning.length !== 0) {
      console.error(chalk.yellow("Warnings: " + boot_warning.length));
      boot_warning.forEach((error) => {
        console.error(error);
      });
    }
  } else {
    console.error(
      chalk.red.underline(
        "Argument Error : Database Password is not set (use '--database_password <password>' to set it)"
      )
    );
    process.exit(5);
  }
}
if (process.argv.find((element) => element === "--help")) {
  console.log(ascii_art);
  console.log("");
  console.log("CR_SERVER - Version 1.0.0");
  console.log(
    "CR_SERVER - Peerplay Relay Server (Based on Lan Play Server (Node) by spacemeowx2)"
  );
  console.log(
    "Improved by MH13 (adding P2P connection and database sync with other servers)"
  );
  console.log("");
  console.log(chalk.gray("Welcome to the Help Page"));
  console.log(
    chalk.gray("Use command line arguments:") +
      chalk.white(
        "'node cr_server.js -- --<argument> <value> --<argument> <value>'"
      )
  );
  console.log("\\");
  console.log("| " + chalk.cyan("* general arguments"));
  console.log("| - help : 'Display this help page' (default: false)");
  console.log("| - ip_address <ip> : 'IP address of the server' (default: '");
  console.log(
    "| - minimal_port_range <number> : 'Mention the minimum port available on your box (shared IPV4 address)' (default: 0)"
  );
  console.log("|");
  console.log("| " + chalk.cyan("* external_server arguments"));
  console.log(
    "| - open_external_server <true/false> : 'Open external server, allow clients to connect via internet' (default: false)"
  );
  console.log(
    "| - external_server_port <number> : 'change external server port' (default: 5982)"
  );
  console.log("|");
  console.log("| " + chalk.cyan("* database arguments"));
  console.log(
    "| - database_sync_limit <number> : 'Limit the number of synchronization launched by your application' (default: 20)"
  );
  console.log(
    "|   " +
      chalk.yellow(
        "warning: this value only affect the number of synchronization launched by your application"
      )
  );
  console.log(
    "| - database_password <password> : 'Change Decryption Password' (Not Recommanded for Users)"
  );
  console.log(
    "| - custom_database_list <ip>:<port>,<ip>:<port> : 'Replace Root Database List' (default: []) (Not Recommanded for Users)"
  );
  console.log("/");
} else {
  main(process.argv.slice(2));
}

const Obtain_Public_IP_Failed = function (ctx: Ctx) {
  let errors_cause: error_pack[] = [];
  let error_description = "";
  let error_solutions: string[] = [];
  let error_name_ipv6 = "UNKNOWN";
  let error_name_ipv4 = "UNKNOWN";
  error_name_ipv6 = chalk.yellow(
    ctx.warning_messages.find((element) => {
      return element.includes(`PUBLIC_IP/IPV6`);
    }) + " [WARNING]"
  );
  if (error_name_ipv6 !== "UNKNOWN") {
    error_description =
      "Unable to obtain your public IPV6 address, this may be due to the fact that your ISP does not support IPV6 or that your router does not support IPV6";
    error_solutions = [
      "Check your router settings to see if IPV6 is enabled",
      "Check your internet access to see if IPV6 is enabled",
    ];
    const error_pack: error_pack = {
      code: error_name_ipv6,
      description: error_description,
      solutions: error_solutions,
    };
    errors_cause.push(error_pack);
  }
  error_name_ipv4 = chalk.yellow(
    ctx.warning_messages.find((element) => {
      return element.includes(`PUBLIC_IP/IPV4`);
    }) + " [WARNING]"
  );
  if (error_name_ipv4 !== "UNKNOWN") {
    error_description =
      "Unable to obtain your public IPV4 address, this may be due to an error in your internet access";
    error_solutions = [
      "Check your internet settings",
    ];
    const error_pack: error_pack = {
      code: error_name_ipv4,
      description: error_description,
      solutions: error_solutions,
    };
    errors_cause.push(error_pack);
  }
  return errors_cause;
};

const Verify_Port_Failed = function (ctx: Ctx, codename: string, port: number) {
  let errors_cause: error_pack[] = [];
  let error_description = "";
  let error_solutions: string[] = [];
  let error_name = "UNKNOWN";
  error_name = chalk.yellow(
    ctx.warning_messages.find((element) => {
      return element.includes(`UPNP/${codename}`);
    }) + " [WARNING]"
  );
  error_name = chalk.red(
    ctx.error_messages.find((element) => {
      return element.includes(`UPNP/${codename}`);
    }) + " [ERROR]"
  );
  if (error_name !== "UNKNOWN") {
    const public_port = port + ctx.peerplay_data.ExternalPortNum;
    const private_port = port;
    error_description =
      "The UPNP function of your router is disabled or not available and you haven't opened the requested port";
    error_solutions = [
      "Make sure UPNP is enabled on your router, otherwise enable it",
      `Make sure you opened manually this port : WAN:'${public_port}' LAN:'${private_port}' protocol:'UDP/TCP'`,
    ];
    const error_pack: error_pack = {
      code: error_name,
      description: error_description,
      solutions: error_solutions,
    };
    errors_cause.push(error_pack);
  }
  if (
    ctx.peerplay_data.ipv4 === undefined &&
    ctx.peerplay_data.ipv6 === undefined &&
    ctx.peerplay_data.ip !== ""
  ) {
    error_description =
      "The domain name you are using may be misconfigured and prevents redirection to your public ip";
    error_solutions = [
      "Make sure you have entered the domain name correctly",
      "Make sure it redirect correctly to your public IP",
    ];
    const error_pack: error_pack = {
      code: chalk.red(
        "PUBLIC_IP/DOMAIN : Failed to test port opening by domain name" +
          " [ERROR]"
      ),
      description: error_description,
      solutions: error_solutions,
    };
    errors_cause.push(error_pack);
  }
  return errors_cause;
};
