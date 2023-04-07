import { Listr } from "listr2";
import chalk from 'chalk';
import { PeerplayData, sources } from '../interface';
import { ServerMonitor } from '../networks/monitor'
import { start_USRV } from '../networks/public/network';
import { syncronize_all_databases } from '../databases/toolkit';

export const startingPeerplayComponents = new Listr([
  {
    title: 'Starting UDP Servers',
    task: async (ctx,task) => {
      const PeerplayData: PeerplayData = ctx.peerplay_data
      start_USRV(
        PeerplayData.ip, 
        PeerplayData.LocalPortNum, 
        PeerplayData.ExternalPortNum, 
        PeerplayData.InterserverPortNum,
        PeerplayData.MinimalPortRange,
        PeerplayData.DatabasePassword)
      task.title = chalk.green(task.title + " [OK]")
    }
  },
  {
    title: 'Starting API and Monitor',
    task: async (ctx,task) => {
      let monitor = new ServerMonitor()
      const PeerplayData: PeerplayData = ctx.peerplay_data
      monitor.start(PeerplayData.PublicAPIPort, PeerplayData.PrivateAPIPort)
      task.title = chalk.green(task.title + " [OK]")
      task.output = `API and Monitor Started` + " [OK]";
    }
  },
  {
    title: 'Starting Database Syncronisation',
    task: async (ctx, task) => {
      const PeerplayData: PeerplayData = ctx.peerplay_data
      if (syncronize_all_databases(PeerplayData.DatabasePassword,PeerplayData.DatabaseSyncLimit,PeerplayData.CustomDatabaseList) === "SUCCESS"){
        task.title = chalk.green(task.title + " [OK]")
        task.output = `Database Syncronisation Started Successfuly` + " [OK]";
      }
      else
      {
        task.title = chalk.red(task.title + " [ERROR]")
        task.output = `Unable to Start Database Syncronisation` + " [ERROR]";
      }
    }
  }
])