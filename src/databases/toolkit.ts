import { root_databases } from "../environment";
const database_list = ["nodes","accounts"];

export function syncronize_all_databases(database_password: string,database_sync_limit: number,database_custom_list: string[]) {
  const PouchDB = require("pouchdb");
  PouchDB.plugin(require("comdb"));
  database_list.forEach((db_name: string) => {
    const DB = new PouchDB(`DB_${db_name}`);
    DB.setPassword(database_password).then(() => {
      syncronize_database(DB, `DB_${db_name}`, database_sync_limit, database_password);
    });
  });
  return "SUCCESS";
}

async function syncronize_database(
  pouchDB: {
    sync: (
      arg0: any,
      arg1: { live: boolean }
    ) => {
      (): any;
      new (): any;
      on: { (arg0: string, arg1: (err: any) => void): any; new (): any };
    };
  },
  db_name: string,
  db_sync_limit: number,
  db_password: string
) {
  const PouchDB = require("pouchdb");
  PouchDB.plugin(require("comdb"));
  let nodeDB = new PouchDB("DB_nodes");
  try {
    // Start DB Syncing
    nodeDB.setPassword(db_password).then(async () => {
      // Keep track of whether a sync is in progress for each database
      interface SyncInProgress {
        [dbUrl: string]: boolean;
      }
      const syncInProgress: SyncInProgress = {};

      // Try to synchronize all root databases
      root_databases.forEach((database) => {
        const dbUrl = `http://${database.address}:${database.port}/${db_name}`;
        // Check if sync is already in progress for this database
        if (syncInProgress[dbUrl]) {
          console.log(`Sync is already in progress for ${dbUrl}`);
          return;
        }
        // Start sync and set syncInProgress flag to true
        syncInProgress[dbUrl] = true;
        const db = new PouchDB(dbUrl);
        pouchDB
          .sync(db, {
            live: true,
          })
          .on("error", function (err: any) {
            console.error(`Sync failed for ${dbUrl}`, err);

            // set syncInProgress flag to false to allow re-sync attempt
            syncInProgress[dbUrl] = false;
          })
          .on("complete", function () {
            // set syncInProgress flag to false once sync is complete
            syncInProgress[dbUrl] = false;
          });
      });
      // ----
    });
  } catch {}
}
