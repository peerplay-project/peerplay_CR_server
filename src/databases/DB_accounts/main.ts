import {PeerplayData} from "../../interface";
import {v4 as uuidV4} from "uuid";
import jwt from "jsonwebtoken";
import {JWT_SECRET} from "../../networks/toolkit";
import {find_data_from_encrypted_value} from "../toolkit";

export interface AccountTable {
  "username":string  // Nom d'Utilisateur
  "username_uuid":string // UUID du Nom d'Utilisateur
  "email":string // Email de Connexion Hashé
  "password":string // Mot de Passe Chiffré Hashé
  "reset_key":string // Clé de reinitialisation de mot de passe (Hashé et Généré Aleatoirement)
}
const ncrypt = require("ncrypt-js");
const PouchDB = require("pouchdb");
PouchDB.plugin(require("pouchdb-upsert"));
PouchDB.plugin(require("pouchdb-find"));
let accountDB = new PouchDB("DB_accounts");
// Requetes API Lié Au Compte Peerplay

// Requetes API lié a L'Authentification
// Fonction d'inscription
export async function register(peerplay_data: PeerplayData,username: string, email: string, password: string, confirmPassword: string) {
  console.log("REGISTER FUNCTION")
  const ncryptObject = new ncrypt(peerplay_data.DatabasePassword);
  console.log("PASSWORD VERIFICATION")
  if (password !== confirmPassword) {
    return {
      status: "ERROR",
      CODE: "PASSWORD_MISSMATCH",
    }
  }
  console.log("EXISTING_ACCOUNT VERIFICATION")
  console.log(ncryptObject.encrypt(email))
  const existingAccount = await find_data_from_encrypted_value(accountDB,email,"email",false, peerplay_data.DatabasePassword, 1);
  // Vérifier si l'e-mail existe déjà dans la base de données

  if (existingAccount.length > 0) {
    return {
      status: "ERROR",
      CODE: "ACCOUNT_ALREADY_EXISTS",
    }
  }
  console.log("ACCOUNT_CREATION")
  const account: AccountTable = {
    username: username,
    username_uuid: uuidV4(),
    email: email,
    password: password,
    reset_key: `${uuidV4()}_${uuidV4()}_${uuidV4()}_${uuidV4()}_${uuidV4()}_${uuidV4()}`,
  };
  const timestamp = Date.now().toString();
  const paddedTimestamp = timestamp.padStart(19, '0');
  const id = `${paddedTimestamp}_${uuidV4()}`;
  await accountDB.upsert(id, function (doc: AccountTable) {
    doc.username = account.username;
    doc.username_uuid = account.username_uuid;
    doc.email = ncryptObject.encrypt(account.email);
    doc.password = ncryptObject.encrypt(account.password);
    doc.reset_key = ncryptObject.encrypt(account.reset_key);
    return doc;
  });

  return {
    status: "SUCCESS",
    CODE: "ACCOUNT_CREATED_SUCCESSFULY",
    DATA: account,
  }
}

// Fonction de connexion
export async function login(peerplay_data: PeerplayData,email: string, password: string) {
  const ncryptObject = new ncrypt(peerplay_data.DatabasePassword);
  // Rechercher le compte par e-mail
  const result = await find_data_from_encrypted_value(accountDB,email,"email",false, peerplay_data.DatabasePassword, 1);

  if (result.length === 0) {
    return {
      status: "ERROR",
      CODE: "ACCOUNT_NOT_FOUND",
    }
  }
  const account = result[0];
  // Vérifier le mot de passe
  if (ncryptObject.decrypt(account.password) === password) {
    const ncryptObjectL1 = new ncrypt(account.username_uuid);
    const token = jwt.sign({
      username_uuid: account.username_uuid,
      identifier: ncryptObjectL1.encrypt(account._id)
    }, JWT_SECRET)
    return {
      status: "SUCCESS",
      CODE: "AUTHENTICATED",
      username:account.username,
      JWT_TOKEN:token
    }
  } else {
    return {
      status: "ERROR",
      CODE: "INCORRECT_PASSWORD",
    }
  }
}
export async function parseToken(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { [key: string]: any };
    const ncryptObjectL1 = new ncrypt(decoded.username_uuid);
    try {
      const account = await accountDB.get(ncryptObjectL1.decrypt(decoded.identifier));
      if (account !== undefined) {
        return account._id
      }
      else{
        return undefined
      }
    } catch (err) {
      // @ts-ignore
      return undefined
    }
  } catch (err) {
    // @ts-ignore
    return err;
  }
}
// Fonction de réinitialisation du mot de passe
export async function resetPassword(peerplay_data: PeerplayData,email: string, resetKey: string | undefined, oldPassword: string | undefined, newPassword: string, confirmNewPassword: string) {
  console.log("RESET PASSWORD FUNCTION")
  const ncryptObject = new ncrypt(peerplay_data.DatabasePassword);

  // Rechercher le compte par e-mail
  console.log("Email Search")
  const result = await find_data_from_encrypted_value(accountDB,email,"email",false, peerplay_data.DatabasePassword, 1);
  if (result.length === 0) {
    return {
      status: "ERROR",
      CODE: "ACCOUNT_NOT_FOUND",
    }
  }
  console.log("New PASSWORD VERIFICATION")
  // Verify If New Password Matching
  if (newPassword !== confirmNewPassword) {
    return {
      status: "ERROR",
      CODE: "PASSWORD_MISSMATCH",
    }
  }
  const account = result[0];
  // Vérifier la clé de réinitialisation
  if (ncryptObject.decrypt(account.reset_key) === resetKey || ncryptObject.decrypt(account.password) === oldPassword) {
    // Mettre à jour le mot de passe
    const newResetKey = `${uuidV4()}_${uuidV4()}_${uuidV4()}_${uuidV4()}_${uuidV4()}_${uuidV4()}`
    await accountDB.upsert(account._id, function (doc: AccountTable) {
      doc.password = ncryptObject.encrypt(newPassword);
      doc.reset_key = ncryptObject.encrypt(newResetKey);
      return doc;
    })
    return {
      status: "SUCCESS",
      CODE: "PASSWORD_RESET_SUCCESSFULY",
      DATA: {
        newPassword: newPassword,
        newResetKey: newResetKey
      }
    }
  } else {
    return {
      status: "ERROR",
      CODE: "INCORRECT_RESET_CREDENTIALS",
    }
  }
}
