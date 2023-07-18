import { Listr, ListrTaskWrapper } from "listr2";
import axios from "axios";
import chalk from "chalk";
import { PeerplayData } from "../interface";

interface arg {
  component: string;
  external_server_opened: boolean;
  ip: string;
  port: number;
  range: number;
}

export const verifyAccessTask = new Listr(
  [
    {
      title: "Verify Interserver Port",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        const result = await verifyAccessPort(
          {
            component: "INTERSERVER",
            external_server_opened: PeerplayData.ExternalServerOpened,
            ip: PeerplayData.ip,
            port: PeerplayData.InterserverPortNum,
            range: PeerplayData.MinimalPortRange,
          },
          task
        );
        switch (result.status) {
          case "success":
            task.title = result.title;
            task.output = result.output;
            break;
          case "skip":
            task.skip(result.output);
            break;
          case "error":
            task.title = result.title;
            task.output = result.output;
            throw new Error(result.title);
          default:
            task.title = result.title;
            throw new Error("UNSUPPORTED STATEMENT - PLEASE REPORT");
        }
      },
    },
    {
      title: "Verify External Port",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        if (PeerplayData.ExternalServerOpened === false) {
          task.title = chalk.gray(
            "Trying to Verify External Port - Port Not Specified"
          );
          task.skip("Port Not Specified");
        } else {
          const result = await verifyAccessPort(
            {
              component: "EXTERNAL",
              external_server_opened: PeerplayData.ExternalServerOpened,
              ip: PeerplayData.ip,
              port: PeerplayData.ExternalPortNum,
              range: PeerplayData.MinimalPortRange,
            },
            task
          );
          switch (result.status) {
            case "success":
              task.title = result.title;
              task.output = result.output;
              break;
            case "skip":
              task.skip(result.output);
              break;
            case "error":
              task.title = result.title;
              task.output = result.output;
              throw new Error(result.title);
            default:
              task.title = result.title;
              throw new Error("UNSUPPORTED STATEMENT - PLEASE REPORT");
          }
        }
      },
    },
    {
      title: "Verify Database Port",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        const result = await verifyAccessPort(
          {
            component: "DATABASE",
            external_server_opened: PeerplayData.ExternalServerOpened,
            ip: PeerplayData.ip,
            port: PeerplayData.DatabasePortNum,
            range: PeerplayData.MinimalPortRange,
          },
          task
        );
        switch (result.status) {
          case "success":
            task.title = result.title;
            task.output = result.output;
            break;
          case "skip":
            task.skip(result.output);
            break;
          case "error":
            task.title = result.title;
            task.output = result.output;
            throw new Error(result.title);
          default:
            task.title = result.title;
            throw new Error("UNSUPPORTED STATEMENT - PLEASE REPORT");
        }
      },
    },
    {
      title: "Verify API Port",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        if (PeerplayData.ExternalServerOpened === false) {
          task.title = chalk.gray(
            "Trying to Verify API Port - External Server Disabled"
          );
          task.skip("External Server Disabled");
        } else {
          const result = await verifyAccessPort(
            {
              component: "API",
              external_server_opened: PeerplayData.ExternalServerOpened,
              ip: PeerplayData.ip,
              port: PeerplayData.PublicAPIPort,
              range: PeerplayData.MinimalPortRange,
            },
            task
          );
          switch (result.status) {
            case "success":
              task.title = result.title;
              task.output = result.output;
              break;
            case "skip":
              task.skip(result.output);
              break;
            case "error":
              task.title = result.title;
              task.output = result.output;
              throw new Error(result.title);
            default:
              task.title = result.title;
              throw new Error("UNSUPPORTED STATEMENT - PLEASE REPORT");
          }
        }
      },
    },
  ],
  { concurrent: true }
);

const verifyAccessPort = async (
  args: arg,
  task: ListrTaskWrapper<any, any>
) => {
  // Importer les modules nécessaires
  const http = require("http");

  // Créer un serveur HTTP temporaire
  const server = http.createServer(
    (req: any, res: { end: (arg0: string) => void }) => {
      res.end("ping/pong");
    }
  );
  console.log(process.env.NODE_ENV);
  if (process.env.NODE_ENV === "production") {
    if (
      (args.component === "EXTERNAL" || args.component === "API") &&
      args.external_server_opened === false
    ) {
      const title = chalk.blue.underline(task.title + " [SKIPPED]");
      const output = `External Server Disabled`;
      const status = "skip";
      return { title, output, status };
    } else {
      try {
        server.listen(args.port, "0.0.0.0");
        console.log(`Server listening on port ${args.port}`);
        console.log(`http://${args.ip}:${args.port + args.range}`);
        const response = await axios.get(
          `http://${args.ip}:${args.port + args.range}`
        );
        if (response.status === 504) {
          const title = chalk.red.underline(task.title + " [FATAL_ERROR]");
          const output = `Unable to Check Port - Port ${args.port} Is Not Reachable`;
          const status = "error";
          return { title, output, status };
        }
        // Fermer le serveur et afficher le résultat
        const title = chalk.green(task.title + " [OK]");
        const output = `Port Checked Successfuly - Port is reachable : ${response.status}`;
        const status = "success";
        return { title, output, status };
      } catch (err: any) {
        if (err.message.indexOf("ECONNREFUSED")) {
          const title = chalk.red.underline(task.title + " [FATAL_ERROR]");
          const output = `Unable to Check Port - Port ${
            args.port + args.range
          } Is Not Reachable`;
          const status = "error";
          return { title, output, status };
        } else {
          const title = chalk.red.underline(task.title + " [FATAL_ERROR]");
          const output = `Unable to Check Port - Unknown Error`;
          const status = "error";
          return { title, output, status };
        }
      } finally {
        server.close();
      }
    }
  } else {
    const title = chalk.blue.underline(task.title + " [SKIPPED]");
    const output = `Ignored Port Checking for decrease starting process (Development Mode)`;
    const status = "skip";
    return { title, output, status };
  }
};
