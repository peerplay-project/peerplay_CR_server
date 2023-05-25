let PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));
// Variables
let database_list: string[] = ["accounts"]
// Fonction pour créer une base de données avec des documents contenant l'ID et la position
export async function createIndexFromDB(database: string) {
  const sourceDB = new PouchDB(`DB_${database}`);
  const indexDB = new PouchDB(`INDEX_${database}`);
  try {
    const start = Date.now();

    // Récupérer tous les documents de l'index
    const DB = await sourceDB.allDocs({ include_docs: true });
    const INDEX = await indexDB.allDocs({ include_docs: true });

    // Supprimer les documents un par un
    const batchSize = 1000; // Nombre de documents à traiter par lot (batch)
    for (let i = 0; i < INDEX.rows.length; i += batchSize) {
      const batch = INDEX.rows.slice(i, i + batchSize);
      // @ts-ignore
      await Promise.all(batch.map(({ doc }) => indexDB.remove(doc)));
    }

    console.log('Données de l\'index effacées avec succès.');

    // Réinitialiser le compteur de position
    let position = 1;
    // Récupérer tous les documents de la sourceDB et les trier par _id
    const sortedDocs = DB.rows.sort((a: { doc: { _id: string; }; }, b: { doc: { _id: any; }; }) => a.doc._id.localeCompare(b.doc._id));
    // Recréer les documents dans l'index avec les nouvelles positions
    for (let i = 0; i < sortedDocs.length; i += batchSize) {
      const batch = sortedDocs.slice(i, i + batchSize);
      // @ts-ignore
      const batchDocuments = batch.map(({ doc }) => ({
        _id: doc._id,
        position: position++,
      }));
      await indexDB.bulkDocs(batchDocuments);
    }

    const end = Date.now();
    console.log(`L'Index: '${database}' a été régénéré avec succès | Temps total : ${end - start} ms.`);

  } catch (error) {
    console.error("Une erreur s'est produite lors de la recréation de l'index : '", database,"' : ", error);
  }
}


export async function indexing_all_databases() {
  const changePromises = database_list.map(async (db_name) => {
    const DB = new PouchDB(`DB_${db_name}`);
    const changes = DB.changes({ live: true, since: 'now', include_docs: true });

    let modifiedDocs = []; // Liste des documents modifiés
    let timeout: NodeJS.Timer; // Identifiant de temporisation

    changes.on('change', async (change: { doc: any; }) => {
      modifiedDocs.push(change.doc); // Ajouter le document modifié à la liste

      // Réinitialiser la temporisation
      if (timeout) {
        clearTimeout(timeout);
      }

      // Démarrer une nouvelle temporisation pour traiter les modifications après un délai (par exemple, 1 seconde)
      timeout = setTimeout(async () => {
        if (modifiedDocs.length > 0) {
          console.log(`Des modifications ont été faites dans ${DB.name}:`, "Lancement d'une indexation");
          await createIndexFromDB(DB.name.split("_")[1]);
          modifiedDocs = []; // Réinitialiser la liste des documents modifiés
        }
      }, 1000); // Délai de temporisation (1 seconde)
    });

    console.log(`Surveillance des changements activée pour ${DB.name}`);
  });

  await Promise.all(changePromises);

  return "SUCCESS";
}
