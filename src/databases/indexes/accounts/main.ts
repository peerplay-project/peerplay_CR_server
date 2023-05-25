let PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));
//Base de Donnée original
let database = new PouchDB('DB_accounts');
const index = new PouchDB('INDEX_accounts');
let changes: any

// Commandes de Recherche
export async function INDEX_accounts_get_position(id_: string) {
  const doc = await index.get(id_)
  return doc.position;
}
