import { PeerplayData } from "interface";

export interface NodesTable {
  "address":string  // Public IP Address Or Domain Name
  "interserver_port":number // Public Port Number
  "external_port":number // Public Port Number
  "database_port":number // Public Port Number
}

export async function updating_network_info(
  peerplay_data: PeerplayData
): Promise<"SUCCESS" | "ERROR"> {
  const ncrypt = require("ncrypt-js");
  const PouchDB = require("pouchdb");
  PouchDB.plugin(require("pouchdb-upsert"));
  let nodeDB = new PouchDB("DB_nodes");
  const ncryptObject = new ncrypt(peerplay_data.DatabasePassword);
  try {
    await nodeDB
      .upsert(peerplay_data.uuid, function (doc: NodesTable) {
        doc.address = ncryptObject.encrypt(peerplay_data.ip);
        doc.interserver_port = peerplay_data.InterserverPortNum + peerplay_data.MinimalPortRange;
        doc.external_port = peerplay_data.ExternalPortNum + peerplay_data.MinimalPortRange;
        doc.database_port = peerplay_data.DatabasePortNum + peerplay_data.MinimalPortRange;
        return doc;
      })
      .catch(function () {
        throw new Error("Unable to update network info");
      });
    return "SUCCESS";
  } catch {
    return "ERROR";
  }
}