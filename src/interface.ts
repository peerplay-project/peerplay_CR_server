export interface PeerplayData {
    ipv6?: any; //Ne Pas Remplir
    ipv4?: any; //Ne Pas Remplir
    // Peerplay Settings
    uuid: string;
    JWT_SECRET: string;
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
export let PeerplaySettings: PeerplayData = {
  ipv6: "",
  ipv4: "",
  uuid: "",
  JWT_SECRET: "",
  ip: "",
  PublicAPIPort: 0,
  PrivateAPIPort: 0,
  LocalPortNum: 0,
  ExternalPortNum: 0,
  InterserverPortNum: 0,
  DatabasePortNum: 0,
  MinimalPortRange: 0,
  DatabaseSyncLimit: 0,
  DatabasePassword: "",
  CustomDatabaseList: [],
};

export function setPeerplaySettings(PeerplayData: PeerplayData) {
  PeerplaySettings = PeerplayData;
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
