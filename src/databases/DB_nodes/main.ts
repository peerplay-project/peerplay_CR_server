export interface NodesTable {
  "_id": string // Identifiant du Noeud (Unix Timestamp + UUID)
  "address":string  // Public IP Address Or Domain Name
  "interserver_port":number // Public Port Number
  "external_port":number // Public Port Number
  "database_port":number // Public Port Number
}