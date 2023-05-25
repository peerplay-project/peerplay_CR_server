import { Listr } from "listr2";
import axios from 'axios';
import { PeerplayData, sources } from '../interface';
import chalk from 'chalk';

interface arg {
  PeerplayData: PeerplayData,
  mode: 'IPV6' | 'IPV4',
}
export const getPublicIpTask = new Listr([
    {
      title: 'Search for IPV6 public address',
      task: async (ctx,task) => {
        const result = await GetPublicIp({PeerplayData: ctx.peerplay_data,mode :'IPV6'})
        if (result.status === 'SUCCESS'){
          ctx.peerplay_data.ipv6 = result.data
          task.output = `IPV6 public address Found: ${result.data}`
          task.title = chalk.green(task.title + ' [OK]')
        }
        else
        {
          task.output = `Unable to retrieve a valid IPV6 public address: ${result.data}`;
          task.title = chalk.yellow(task.title + ' [WARNING]')
          ctx.warning_messages.push('PUBLIC-IP/IPV6 : ' + `Unable to retrieve a valid IPV6 public address : ${result.data}`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    },
    {
      title: 'Search for IPV4 public address',
      task: async (ctx,task) => {
        const result = await GetPublicIp({PeerplayData: ctx.peerplay_data,mode :'IPV4'})
        if (result.status === 'SUCCESS'){
          ctx.peerplay_data.ipv4 = result.data
          task.output = `IPV4 public address Found: ${result.data}`
          task.title = chalk.green(task.title + ' [OK]')
        }
        else
        {
          task.title = chalk.yellow(task.title + ' [WARNING]')
          task.output = `Unable to retrieve a valid IPV4 public address : ${result.data}`;
          ctx.warning_messages.push('PUBLIC-IP/IPV4 : ' + `Unable to retrieve a valid IPV4 public address : ${result.data}`)
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    },
    {
      title: 'Set IP address',
      task: (ctx,task) => {
        ctx.peerplay_data.ip = ctx.peerplay_data.ipv4 || ctx.peerplay_data.ipv6;
        if (ctx.peerplay_data.ip === ""){
          task.title = chalk.red.underline(task.title + ' [FATAL_ERROR]')
          throw new Error('Unable to define a valid IP address')
        }
        task.title = chalk.green(task.title + ' [OK]')
      }
    }
  ], { concurrent: false });

  const GetPublicIp = async (args: arg) => {
    const errors = [];
    let regex
    let source
    let ip
    if (args.mode == 'IPV6'){
      regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
      source = sources.ipv6
    }
    else
    {
      regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      source = sources.ipv4
    }
    for (const url of source) {
      try {
        const { data } = await axios.get(url);
        if (regex.test(data)) {
          ip = data;
        }
        break;
      } catch (error) {
        errors.push(error);
      }
    }
    if (!ip) {
      return {status: 'ERROR', data: `Impossible de récupérer une adresse IP valide : ${errors.join(', ')}`}
    }
    return {status: 'SUCCESS', data: ip} 
  }