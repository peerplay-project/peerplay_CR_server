export interface PeerplayData {
    ipv6?: any; //Ne Pas Remplir
    ipv4?: any; //Ne Pas Remplir
    // Peerplay Settings
    uuid: string;
    ip: string
    PublicAPIPort: number;
    PrivateAPIPort: number;
    LocalPortNum: number;
    ExternalPortNum: number;
    InterserverPortNum: number;
    DatabasePortNum: number;
    MinimalPortRange: number;
    DatabaseSyncLimit: number;
    DatabasePassword: string;
    CustomDatabaseList: string[];
}

export const sources = {
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