import { Listr } from "listr2";
import chalk from 'chalk';
import { PeerplayData } from '../interface';
import { ServerMonitor } from '../networks/monitor'
import { start_USRV } from '../networks/public/network';
import { open_all_databases, syncronize_all_databases } from '../databases/toolkit';
import { updating_network_info } from '../databases/DB_nodes/main';

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
    title: 'Updating Connect Data',
    task: async (ctx, task) => {
      const PeerplayData: PeerplayData = ctx.peerplay_data
      if (await updating_network_info(PeerplayData) === "SUCCESS"){
        task.title = chalk.green(task.title + " [OK]")
        task.output = `Connect Data Updated Successfuly` + " [OK]";
      }
      else
      {
        task.title = chalk.red(task.title + " [ERROR]")
        task.output = `Unable to Updating Connect Data` + " [ERROR]";
      }
    }
  },
  {
    title: 'Opening Database Connections',
    task: async (ctx, task) => {
      const PeerplayData: PeerplayData = ctx.peerplay_data
      if (open_all_databases(PeerplayData.DatabasePortNum) === "SUCCESS"){
        task.title = chalk.green(task.title + " [OK]")
        task.output = `Database Syncronisation Started Successfuly` + " [OK]";
      }
      else
      {
        task.title = chalk.red(task.title + " [ERROR]")
        task.output = `Unable to Start Database Syncronisation` + " [ERROR]";
      }
    }
  },
  {
    title: 'Starting Database Syncronisation',
    task: async (ctx, task) => {
      const PeerplayData: PeerplayData = ctx.peerplay_data
      if (syncronize_all_databases(PeerplayData.DatabaseSyncLimit,PeerplayData.CustomDatabaseList) === "SUCCESS"){
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