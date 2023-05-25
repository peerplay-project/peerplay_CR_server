import { root_databases } from "../environment";
const ncrypt = require("ncrypt-js");
const database_list = ["nodes", "accounts"];
const PouchDB = require("pouchdb");
interface database {
  address: string;
  port: number;
}
export async function find_data_from_encrypted_value(database: PouchDB.Database, value: string, key: string, encrypt:boolean, encrypt_key: string, limit: number) {
  let search_result: any[] = [];
await database.allDocs({
    include_docs: true,
    attachments: true,
  })
    .then((results: { rows: any[] }) => {
      results.rows.forEach((result) => {
        try {
          if (result.doc !== undefined) {
            // @ts-ignore : ignore all typescript errors
            if (encrypt) {
              if (result.doc[key] === value) {
                search_result.push(result.doc);
              }
            } else {
              const ncryptObject = new ncrypt(encrypt_key);
              if (ncryptObject.decrypt(result.doc[key]) == value) {
                search_result.push(result.doc);
              }
            }
          }
        } catch (error) {
          // Do Nothing
        }
      });
    })
    .catch(function (err: any) {
      console.log(err);
    });
  return search_result.slice(0, limit--)
}
export function open_all_databases(port: number) {
  let app = require("express-pouchdb")({
  });
  app.setPouchDB(PouchDB);
  database_list.forEach((db_name) => {
    console.log(`Starting Database ${db_name}`);
    const database = new PouchDB(`DB_${db_name}`);
    console.log(`Started Database ${db_name}`);
  });
  app.listen(port);
  return "SUCCESS";
}

export function syncronize_all_databases(
  database_sync_limit: number,
  database_custom_list: string[]
) {
  database_list.forEach((db_name: string) => {
    const DB = new PouchDB(`DB_${db_name}`);
    syncronize_database(
      DB,
      `DB_${db_name}`,
      database_sync_limit,
      database_custom_list
    ).then(r =>{});
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
  database_custom_list: string[]
) {
  let nodeDB = new PouchDB("DB_nodes");
  try {
    // Start DB Syncing
    // Keep track of whether a sync is in progress for each database
    interface SyncInProgress {
      [dbUrl: string]: boolean;
    }
    const syncInProgress: SyncInProgress = {};
    let databases: database[] = [];
    if (database_custom_list.length === 0) {
      databases = root_databases;
    } else {
      database_custom_list.map((db: string) => {
        const database = db.split(":");
        databases.push({ address: database[0], port: parseInt(database[1]) });
      });
    }

    // Try to synchronize all root databases
    databases.forEach((database: database) => {
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
          console.error(`Sync failed for ${dbUrl}`, err.message);

          // set syncInProgress flag to false to allow re-sync attempt
          syncInProgress[dbUrl] = false;
        })
        .on("complete", function () {
          // set syncInProgress flag to false once sync is complete
          syncInProgress[dbUrl] = false;
        });
    });
    // ----
  } catch {}
}
