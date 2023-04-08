export interface AccountTable {
  "_id": string // Identifiant du Noeud (Unix Timestamp + UUID)
  "username":string  // Nom d'Utilisateur (suivi d'un numero aleatoire de 6 chiffres) 
  "login":string // Identifiant de Connexion Hashé
  "password":number // Mot de Passe Chiffré Hashé
  "reset_key":number // Clé de reinitialisation de mot de passe (Hashé et Généré Aleatoirement)
  "activated":boolean // All New Accounts is activated by servers every Minutes
}

export function connect(login:string, password:string){

}
export function register(username:string, login:string, password:string){

}
export function reset_password(login:string, reset_key:string,new_password:string){

}