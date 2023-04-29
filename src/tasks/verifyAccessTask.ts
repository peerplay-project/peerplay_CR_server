import { Listr, ListrTaskWrapper } from "listr2";
import axios from "axios";
import chalk from "chalk";
import { PeerplayData } from "../interface";

interface arg {
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
            ip: PeerplayData.ip,
            port: PeerplayData.InterserverPortNum,
            range: PeerplayData.MinimalPortRange,
          },
          task
        );
        if (result.status === "success") {
          task.title = result.title;
          task.output = result.output;
        } else {
          task.title = result.title;
          task.output = result.output;
          throw new Error(result.title)
        }
      },
    },
    {
      title: "Verify External Port",
      task: async (ctx, task) => {
        const PeerplayData: PeerplayData = ctx.peerplay_data;
        if (PeerplayData.ExternalPortNum === 0) {
          task.title = chalk.gray(
            "Trying to Verify External Port - Port Not Specified"
          );
          task.skip();
        } else {
          const result = await verifyAccessPort(
            {
              ip: PeerplayData.ip,
              port: PeerplayData.InterserverPortNum,
              range: PeerplayData.MinimalPortRange,
            },
            task
          );
          if (result.status === "success") {
            task.title = result.title;
            task.output = result.output;
          } else {
            task.title = result.title;
            task.output = result.output;
            throw new Error(result.title)
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
            ip: PeerplayData.ip,
            port: PeerplayData.InterserverPortNum,
            range: PeerplayData.MinimalPortRange,
          },
          task
        );
        if (result.status === "success") {
          task.title = result.title;
          task.output = result.output;
        } else {
          task.title = result.title;
          task.output = result.output;
          throw new Error(result.title)
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
  try {
    server.listen(args.port, "0.0.0.0");
    const response = await axios.get(
      `https://${args.ip}:${args.port + args.range}`
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
      const output = `Unable to Check Port - Port ${args.port} Is Not Reachable`;
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
};
