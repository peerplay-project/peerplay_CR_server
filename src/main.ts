import { SLPServer } from './slpserver'
import { ServerMonitor } from './monitor'
import Listr from 'listr';
import axios from 'axios';
interface PeerplayPorts {
  ipv6?: any; //Ne Pas Remplir
  ipv4?: any; //Ne Pas Remplir
  ip: string
  PublicAPIPort: number;
  PrivateAPIPort: number;
  LocalPortNum: number;
  ExternalPortNum: number;
  InterserverPortNum: number;
  MinimalPortRange: number;
}

const tasks = new Listr([
  {
    title: 'Starting Peerplay',
    task: (PeerplayPorts: PeerplayPorts) => {
      return new Listr([
        {
          title: 'Obtenir l\'adresse IP publique',
          task: (PeerplayPorts, task) => {
            const sources = {
              ipv4: [
                "http://myexternalip.com/raw",
                "http://ipecho.net/plain",
                "http://whatismyip.akamai.com"
              ],
              ipv6: ["https://api6.ipify.org",
                "http://ipv6.icanhazip.com",
                "http://ipv6.whatismyip.akamai.com"
              ]
            };

            if (PeerplayPorts.ip !== '') {
              task.skip('Adresse IP publique déjà fournie par l\'utilisateur');
              return;
            }
            return new Listr([
              {
                title: 'Recherche de l\'adresse IPV6',
                task: async (PeerplayPorts, task) => {
                  const errors = [];
                  for (const url of sources.ipv6) {
                    try {
                      const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
                      const { data } = await axios.get(url);
                      if (ipv6Regex.test(data)) {
                        PeerplayPorts.ipv6 = data;
                        task.output = `IPV6 Trouvé: ${PeerplayPorts.ipv6}`;
                      }
                      break;
                    } catch (error) {
                      errors.push(error);
                    }
                  }
                  if (!PeerplayPorts.ipv6) {
                    task.skip(`Impossible de récupérer une adresse IPV6 valide : ${errors.join(', ')}`);
                  }
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              },
              {
                title: 'Recherche de l\'adresse IPV4',
                task: async (PeerplayPorts, task) => {
                  const errors = [];
                  for (const url of sources.ipv4) {
                    try {
                      const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                      const { data } = await axios.get(url);
                      if (ipv4Regex.test(data)) {
                        PeerplayPorts.ipv4 = data;
                        task.output = `IPV4 Trouvé: ${PeerplayPorts.ipv4}`;
                      }
                      break;
                    } catch (error) {
                      errors.push(error);
                    }
                  }
                  if (!PeerplayPorts.ipv4) {
                    throw new Error(`Impossible de récupérer une adresse IPV4 valide : ${errors.join(', ')}`);
                  }
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              },
              {
                title: 'Définir l\'adresse IP',
                task: (PeerplayPorts, task) => {
                  PeerplayPorts.ip = PeerplayPorts.ipv4 || PeerplayPorts.ipv6;
                }
              }
            ], { concurrent: false });
          },
        },
        {
          title: 'Trying to Open Ports on Your Router Using UPNP',
          task: (PeerplayPorts: PeerplayPorts) => {
            return new Listr([
              {
                title: 'Trying to Open Interserver Port',
                task: async (PeerplayPorts, task) => {
                  try {
                    const natUpnp = require('nat-upnp');
                    const client = natUpnp.createClient();
                    await Promise.all([
                      client.portMapping({
                        public: PeerplayPorts.InterserverPortNum,
                        private: PeerplayPorts.InterserverPortNum,
                        protocol: 'UDP',
                        ttl: 10000
                      }),
                      client.portMapping({
                        public: PeerplayPorts.InterserverPortNum,
                        private: PeerplayPorts.InterserverPortNum,
                        protocol: 'TCP',
                        ttl: 10000
                      })
                    ]);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    client.getMappings(async (err: any, results: any) => {
                      if (err) {
                        task.skip(`Failed to check UPnP port mappings: ${err}`);
                      } else {
                        let mappingUDP = results.find((result: any) => result.private.port === PeerplayPorts.InterserverPortNum &&
                          (result.protocol === 'udp') &&
                          result.enabled === true &&
                          result.private.host === require('ip').address());
                        let mappingTCP = results.find((result: any) => result.private.port === PeerplayPorts.InterserverPortNum &&
                          (result.protocol === 'tcp') &&
                          result.enabled === true &&
                          result.private.host === require('ip').address());
                        if (mappingUDP !== undefined && mappingTCP !== undefined) {
                          task.output = `Interserver port ${PeerplayPorts.InterserverPortNum} (UDP and TCP) is open on UPNP`;
                        } else {
                          if (mappingUDP) {
                            task.output = `Interserver port ${PeerplayPorts.InterserverPortNum} (UDP Only) is open on UPNP`;
                          }
                          else {
                            throw new Error(`Failed to open Interserver port: ${JSON.stringify(results)}/${require('ip').address()}:${PeerplayPorts.InterserverPortNum}/${mappingUDP}`);
                          }
                        }
                      }
                    });

                    await new Promise(resolve => setTimeout(resolve, 5000));
                  } catch (err) {
                    throw new Error(`Failed to open Interserver port: ${err}`);
                  }
                }
              },
              {
                title: 'Trying to Open External Port',
                task: async (PeerplayPorts, task) => {
                  if (PeerplayPorts.ExternalPortNum - PeerplayPorts.MinimalPortRange === 0) {
                    task.skip('External server is disabled, no need to open the port');
                  } else {
                    try {
                      const natUpnp = require('nat-upnp');
                      const client = natUpnp.createClient();
                      await Promise.all([
                        client.portMapping({
                          public: PeerplayPorts.ExternalPortNum,
                          private: PeerplayPorts.ExternalPortNum,
                          protocol: 'UDP',
                          ttl: 10000
                        }),
                        client.portMapping({
                          public: PeerplayPorts.ExternalPortNum,
                          private: PeerplayPorts.ExternalPortNum,
                          protocol: 'TCP',
                          ttl: 10000
                        })
                      ]);
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      client.getMappings(async (err: any, results: any) => {
                        if (err) {
                          task.skip(`Failed to check UPnP port mappings: ${err}`);
                        } else {
                          const mappingUDP = results.find((result: any) => result.private.port === PeerplayPorts.InterserverPortNum &&
                            (result.protocol === 'udp') &&
                            result.enabled === true &&
                            result.private.host === require('ip').address());
                          const mappingTCP = results.find((result: any) => result.private.port === PeerplayPorts.InterserverPortNum &&
                            (result.protocol === 'udp') &&
                            result.enabled === true &&
                            result.private.host === require('ip').address());
                          if (mappingUDP && mappingTCP) {
                            task.output = `External port ${PeerplayPorts.ExternalPortNum} (UDP and TCP) is open on UPNP`;
                          } else {
                            if (mappingUDP) {
                              task.output = `External port ${PeerplayPorts.ExternalPortNum} (UDP Only) is open on UPNP`;
                            }
                            else {
                              throw new Error(`Failed to open External port: ${err}`);
                            }
                          }
                        }
                      });
                      await new Promise(resolve => setTimeout(resolve, 5000));
                    } catch (err) {
                      throw new Error(`Failed to open External port: ${err}`);
                    }
                  }
                }
              }
            ], { concurrent: true });
          },
        },
        {
          title: 'Verify if Port Is Opened on Your Router',
          task: () => {
            return new Listr([
              {
                title: 'Verify Interserver Port',
                task: async () => {
                  return new Listr([
                    {
                      title: 'Checking',
                      task: async (PeerplayPorts, task) => {
                        try {
                          // Importer les modules nécessaires
                          const http = require('http');
                          const { URL } = require('url');

                          // Créer un serveur HTTP temporaire
                          const server = http.createServer((req: any, res: { end: (arg0: string) => void; }) => {
                            res.end("ping/pong");
                          });
                          server.listen(PeerplayPorts.InterserverPortNum, '0.0.0.0');

                          // Effectuer une requête HTTP vers le serveur
                          const response = await http.get(new URL(`http://${PeerplayPorts.ip}:${PeerplayPorts.InterserverPortNum}`));


                          // Vérifier la réponse
                          if (response.statusCode === 504) {
                            throw new Error(`Interserver port ${PeerplayPorts.InterserverPortNum} is not reachable`);
                          }

                          // Fermer le serveur et afficher le résultat
                          server.close();
                          task.output = `Interserver port is reachable`;
                          await new Promise(resolve => setTimeout(resolve, 5000));
                        } catch (err: any) {
                          task.title = `${task.title}`;
                          task.output = err.message;
                          throw err;
                        }
                      }
                    }
                  ], { exitOnError: true })
                }
              },
              {
                title: 'Verify External Port',
                task: async (PeerplayPorts, task) => {
                  return new Listr([
                    {
                      title: 'Checking',
                      task: async (PeerplayPorts, task) => {
                        if (PeerplayPorts.ExternalPortNum === 0) {
                          task.skip('External server is disabled, no need to verify the port');
                        } else {
                          try {
                            // Importer les modules nécessaires
                            const http = require('http');
                            const { URL } = require('url');

                            // Créer un serveur HTTP temporaire
                            const server = http.createServer();
                            server.listen(PeerplayPorts.ExternalPortNum, '0.0.0.0');

                            // Effectuer une requête HTTP vers le serveur
                            const response = await http.get(new URL(`http://${PeerplayPorts.ip}:${PeerplayPorts.ExternalPortNum}`));

                            // Vérifier la réponse
                            if (response.statusCode === 504) {
                              throw new Error(`External port ${PeerplayPorts.ExternalPortNum} is not reachable`);
                            }

                            // Fermer le serveur et afficher le résultat
                            server.close();
                            task.output = `External port is reachable`;
                            await new Promise(resolve => setTimeout(resolve, 10000));
                          } catch (err: any) {
                            task.title = `${task.title}`;
                            task.output = err.message;
                            throw err;
                          }
                        }
                      }
                    }
                  ], { exitOnError: false })
                }
              }
            ], { concurrent: true });
          }
        }
      ], { concurrent: false });
    }
  }])

function parseArgs2Obj(args: string[]) {
  let argsObj: any = {};
  for (let i = 0; i < args.length; i += 2) {
    let key: string = args[i];
    let value: string = args[i + 1];
    if (key.startsWith('--')) {
      argsObj[key.slice(2)] = value;
    }
  }
  return argsObj;
}
async function main(argv: string[]) {
  let argsObj = parseArgs2Obj(argv);
  let server_ip = argsObj.slp_ip || undefined
  const PublicAPIPort = 11450
  const PrivateAPIPort = 11400
  const MinimalPortRange = parseInt(argsObj.minimal_port_range || 0)
  const LocalPortNum = parseInt(argsObj.slp_local_port || 11451)
  const ExternalPortNum = parseInt(argsObj.slp_external_port || 0) + MinimalPortRange
  const InterserverPortNum = parseInt(argsObj.slp_interserver_port || 11453) + MinimalPortRange
  const PeerplayPorts: PeerplayPorts = {
    ip: '',
    PublicAPIPort: PublicAPIPort,
    PrivateAPIPort: PrivateAPIPort,
    LocalPortNum: LocalPortNum,
    ExternalPortNum: ExternalPortNum,
    InterserverPortNum: InterserverPortNum,
    MinimalPortRange: MinimalPortRange
  }
  tasks.run(PeerplayPorts).catch(err => {
    console.error(err);
  });
}
async function main_old(argv: string[]) {
  let argsObj = parseArgs2Obj(argv);
  let server_ip = argsObj.slp_ip || undefined
  const PublicAPIPort = 11450
  const PrivateAPIPort = 11400
  const LocalPortNum = parseInt(argsObj.slp_local_port || 11451)
  const ExternalPortNum = parseInt(argsObj.slp_external_port || 0)
  const InterserverPortNum = parseInt(argsObj.slp_interserver_port || 11453)
  let s = new SLPServer(server_ip, LocalPortNum, ExternalPortNum, InterserverPortNum)
  let monitor = new ServerMonitor(s)
  monitor.start(PublicAPIPort, PrivateAPIPort)
}

main(process.argv.slice(2))
