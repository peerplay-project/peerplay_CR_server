import Router, { IRouterContext } from "koa-router";
import yamljs from "yamljs";
import Speedtest from "speedtest-net";
import { koaSwagger } from "koa2-swagger-ui";
import { get_server_info, get_server_size } from "../public/network";
import { parseToken } from "../../databases/DB_accounts/main";
import Koa from "koa";
import { INDEX_accounts_get_position } from "../../databases/indexes/accounts/main";
import {
  downloadDependencies,
  ip_calculator_from_position,
  jitterDependencies,
  pingDependencies,
  split_filter,
  uploadDependencies,
} from "../toolkit";
import {
  findClientFilter_LOCAL_USRV,
  getAllClientFilter_LOCAL_USRV,
  setClientFilter_LOCAL_USRV,
  switchStrictClientFilter_LOCAL_USRV,
} from "../public/components/entrypoints/local";
import {
  findClientFilter_EXTERNAL_USRV,
  setClientFilter_EXTERNAL_USRV,
} from "../public/components/entrypoints/external";
import { v4 as uuidv4 } from "uuid";
import { promisify } from "util";
import chalk from "chalk";
const unprotectedRoutes = [
  "/network/general/status",
  "/swagger",
  "/auth/swagger",
  "/auth/register",
  "/auth/login",
  "/auth/reset_password",
  "/account/filter/filter_settings/refresh_network_type",
];
interface changes {
  LOCAL: {
    identifier: string;
    filter: {
      NETWORK_TYPE: Buffer;
      CONNECT_TYPE: Buffer;
      PASSWORD: Buffer;
      POOL: Buffer;
    };
    strict: boolean | undefined;
  }[];
  EXTERNAL: {
    identifier: string;
    filter: {
      NETWORK_TYPE: Buffer;
      CONNECT_TYPE: Buffer;
      PASSWORD: Buffer;
      POOL: Buffer;
    };
  }[];
}
let test_in_progress = false;
let lastTest:
  | undefined
  | { upload: number; download: number; ping: number; jitter: number } =
  undefined;
const PEERPLAY_HEADER = Buffer.alloc(9); // buffer de taille 9
PEERPLAY_HEADER.write("peerplay:");
const DASH = Buffer.alloc(1); // buffer de taille 1
DASH.write("-");
const SLASH = Buffer.alloc(1); // buffer de taille 1
SLASH.write("/");

// API
const jwtMiddleware: Router.IMiddleware<any, Koa.DefaultState> = async (
  ctx,
  next
) => {
  // Vérifier si la route actuelle doit être ignorée
  if (unprotectedRoutes.includes(ctx.path)) {
    await next(); // Passer au middleware suivant
    return;
  }

  // Récupérer le JWT depuis les en-têtes de requête
  const token = `${ctx.headers.authorization}`.split(" ")[1];

  // Vérifier le JWT
  if (!token) {
    ctx.status = 401;
    ctx.body = {
      CODE: "MISSING_JWT",
      MESSAGE:
        "The JWT is missing, please provide it in the Authorization header",
    };
    return;
  }

  const decodedToken = await parseToken(token);
  if (typeof decodedToken === "string") {
    ctx.state.user_uuid = decodedToken;
    await next(); // Passer au middleware suivant
  } else {
    if (decodedToken === undefined) {
      ctx.status = 401;
      ctx.body = {
        CODE: "INVALID_JWT",
        MESSAGE: "The JWT is invalid, please provide a valid JWT",
      };
      return;
    } else {
      // @ts-ignore
      switch (decodedToken.message) {
        case "invalid signature":
          ctx.status = 401;
          ctx.body = {
            CODE: "INVALID_JWT_SIGNATURE",
            MESSAGE: "The JWT Signature is invalid please regenerate JWT",
          };
          return;
        default:
          ctx.status = 401;
          // @ts-ignore
          ctx.body = { CODE: "INVALID_JWT", MESSAGE: decodedToken.message };
          return;
      }
    }
  }
};

export class PublicRouter {
  public router = new Router();

  constructor() {
    // Setup Swagger UI
    const path = require("path");
    const swaggerFilePath = path.join(__dirname, "swagger", "public.yaml");
    const swagger = yamljs.load(swaggerFilePath);
    // Utilisation du middleware sur le routeur
    this.router.use(jwtMiddleware);
    // Public Router Routes (No Auth)
    this.router.get("/network/general/status", async (ctx) => {
      await this.handleGetInfo(ctx);
    });
    this.router.get(
      "/swagger",
      async (ctx, next) => {
        // Récupérer l'adresse IP du client
        const clientIP = ctx.request.ip;

        // Vérifier si l'adresse IP du client est dans le Localhost
        if (clientIP !== "127.0.0.1" && clientIP !== "::1") {
          ctx.status = 403; // Accès interdit
          ctx.body =
            "Accès refusé : La Documentation Swagger est uniquement accessible en Localhost";
        } else {
          await next();
        }
      },
      koaSwagger({ routePrefix: false, swaggerOptions: { spec: swagger } })
    );
    // Public Router Routes (Require Authentication)
    this.router.get("/console/ip_settings/get_ip_address", async (ctx) => {
      await this.handleGetIpAddress(ctx);
    });
    this.router.get("/account/filter/filter_settings", async (ctx) => {
      await this.getFilter(ctx);
    });
    this.router.post(
      "/account/filter/filter_settings/refresh_network_type",
      async (ctx) => {
        await this.setFilter("NETWORK_TYPE", ctx);
      }
    );
    this.router.post(
      "/account/filter/filter_settings/network_filtration",
      async (ctx) => {
        await this.strictMode(ctx);
      }
    );
    this.router.post(
      "/account/filter/filter_settings/password_key",
      async (ctx) => {
        await this.setFilter("PASSWORD_KEY", ctx);
      }
    );
    this.router.post(
      "/account/filter/filter_settings/geographic_key",
      async (ctx) => {
        await this.setFilter("GEOGRAPHIC_KEY", ctx);
      }
    );
    this.router.all("*", async (ctx, next) => {
      try {
        await next();
      } catch (err) {
        console.error(err);
        ctx.status = 500;
        ctx.body = {
          error: "server exceptions",
        };
      }
    });
  }

  private async handleGetInfo(ctx: IRouterContext) {
    const network_size = get_server_size();
    const slp_ports = get_server_info();
    let external_ip;
    if (slp_ports.external_local === 0) {
      external_ip = "DISABLED";
    } else {
      external_ip = `${slp_ports.address}:${slp_ports.external_internet}`;
    }
    ctx.type = "application/json";
    ctx.body = {
      online: network_size,
      external_ip: external_ip,
    };
  }

  // Get IP Address from User Position
  private async handleGetIpAddress(ctx: IRouterContext) {
    const ip_identifier = ip_calculator_from_position(
      await INDEX_accounts_get_position(ctx.state.user_uuid),
      "1.0.1.0",
      "1.0.255.254",
      "255.0.0.0"
    );
    if (ip_identifier !== undefined) {
      ctx.status = 200;
      ctx.type = "application/json";
      ctx.body = {
        status: "SUCCESS",
        code: "IP_ADDRESS_FOUND",
        console_ip: {
          PS3: "1." + ip_identifier,
          XBOX_360: "2." + ip_identifier,
          PS4: "3." + ip_identifier,
          XBOX_ONE: "4." + ip_identifier,
          SWITCH: "5." + ip_identifier,
          PS5: "6." + ip_identifier,
          XBOX_SERIES: "7." + ip_identifier,
        },
        console_gateway: {
          PS3: "1." + "0.0.1",
          XBOX_360: "2." + "0.0.1",
          PS4: "3." + "0.0.1",
          XBOX_ONE: "4." + "0.0.1",
          SWITCH: "5." + "0.0.1",
          PS5: "6." + "0.0.1",
          XBOX_SERIES: "7." + "0.0.1",
        },
      };
    } else {
      ctx.status = 503;
      ctx.type = "application/json";
      ctx.body = {
        status: "ERROR",
        code: "USER_POSITION_OUT_OF_RANGE",
      };
    }
  }

  // Get Filter of a user
  private async getFilter(ctx: Koa.Context) {
    const ip_identifier = ip_calculator_from_position(
      await INDEX_accounts_get_position(ctx.state.user_uuid),
      "1.0.1.0",
      "1.0.255.254",
      "255.0.0.0"
    );
    if (ip_identifier !== undefined) {
      const current_filter:
        | {
            source: string;
            filter: Buffer;
          }
        | undefined =
        findClientFilter_LOCAL_USRV(ip_identifier) ||
        findClientFilter_EXTERNAL_USRV(ip_identifier);
      if (current_filter !== undefined) {
        ctx.type = "application/json";
        ctx.body = {
          message: "success",
          source: current_filter.source,
          actual_filter: {
            network_type: current_filter.filter
              .slice(9, 12)
              .toString()
              .split("\0")[0], // NETWORK_TYPE est entre 9 et 12
            connect_type: current_filter.filter
              .slice(12, 16)
              .toString()
              .split("\0")[0], // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
            password: current_filter.filter
              .slice(17, 53)
              .toString()
              .split("\0")[0],
            pool: current_filter.filter.slice(54, 90).toString().split("\0")[0],
          },
        };
      } else {
        ctx.type = "application/json";
        ctx.body = {
          message: "error",
          actual_filter: "NO_FILTER_FOUND",
        };
      }
    }
  }

  // Enable or disable the network filtering for one user
  private async strictMode(ctx: Koa.Context) {
    const ip_identifier = ip_calculator_from_position(
      await INDEX_accounts_get_position(ctx.state.user_uuid),
      "1.0.1.0",
      "1.0.255.254",
      "255.0.0.0"
    );
    if (ip_identifier !== undefined) {
      const script = switchStrictClientFilter_LOCAL_USRV(ip_identifier);
      if (script.result === true && typeof script.strict === "boolean") {
        ctx.status = 200;
        ctx.type = "application/json";
        ctx.body = {
          message: "success",
          strict: script.strict,
        };
      } else {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = {
          message: "error",
          code: "User Offline",
        };
      }
    } else {
      ctx.status = 400;
      ctx.type = "application/json";
      ctx.body = {
        message: "error",
        code: "Cannot find ip_identifier",
      };
    }
  }

  private async setFilter(method: string, ctx: IRouterContext) {
    let filter_calculation_errors: any[] = [];
    let changes: changes = { LOCAL: [], EXTERNAL: [] };
    let result: { changes: changes; errors: any[]; new_informations: object } =
      {
        changes: changes,
        errors: filter_calculation_errors,
        new_informations: {},
      };
    // Calculation Module
    // Entrée : Methode Employé + Paramètres Necessaires
    switch (method) {
      case "NETWORK_TYPE":
        result = await setFilterNetworkType(
          changes,
          filter_calculation_errors,
          ctx
        );
        break;
      case "PASSWORD_KEY":
        result = await setFilterPasswordKey(
          changes,
          filter_calculation_errors,
          ctx
        );
        break;
      case "GEOGRAPHIC_KEY":
        result = await setFilterGeographicKey(
          changes,
          filter_calculation_errors,
          ctx
        );
        break;
      case "POOL":
        result = await setFilterPool(changes, filter_calculation_errors, ctx);
        break;
      default:
        ctx.status = 401;
        ctx.type = "application/json";
        ctx.body = {
          message: "error",
          code: "INVALID_METHOD",
        };
    }
    // Sortie Liste des Modifications a faire (Séparé par source) + Liste des erreurs
    if (result.errors.length === 0) {
      // Processing Module
      // Entrée : Liste des Modifications a faire (Séparé par source)
      let filter_process_errors: any[] = [];
      const local_changes_number = changes.LOCAL.length;
      const external_changes_number = changes.EXTERNAL.length;
      let local_changes_processed = 0;
      let external_changes_processed = 0;
      changes.LOCAL.forEach((change) => {
        try {
          setClientFilter_LOCAL_USRV(
            change.identifier,
            change.filter,
            change.strict
          );
          local_changes_processed++;
        } catch (e: any) {
          filter_process_errors.push(e);
        }
      });
      changes.EXTERNAL.forEach((change) => {
        try {
          setClientFilter_EXTERNAL_USRV(change.identifier, change.filter);
          external_changes_processed++;
        } catch (e: any) {
          filter_process_errors.push(e);
        }
      });
      // Sortie : Liste des erreurs relatées au processus de modification
      if (
        filter_process_errors.length === 0 &&
        local_changes_processed === local_changes_number &&
        external_changes_processed === external_changes_number
      ) {
        // Cas ou le Processus de modification s'est bien déroulé
        ctx.status = 200;
        ctx.type = "application/json";
        ctx.body = {
          message: "success",
          new_informations: result.new_informations,
        };
      } else {
        // Cas ou le Processus de modification a rencontré des erreurs ou que le nombre de modifications effectuées n'est pas le même que le nombre de modifications demandées
        console.log(
          new Date().toLocaleTimeString() +
            ": Error Found on Processing Module, Returning Response to Client"
        );
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = {
          message: "error",
          code: "FILTER_PROCESS_ERROR",
          errors: filter_process_errors,
        };
      }
    } else {
      // Cas ou le Calcul des modifications necessaires a rencontré des erreurs
      console.log(
        new Date().toLocaleTimeString() +
          ": Error Found on Filter Script, Returning Response to Client"
      );
      ctx.status = 400;
      ctx.type = "application/json";
      ctx.body = {
        message: "error",
        code: "FILTER_CALCULATION_ERROR",
        errors: filter_calculation_errors,
      };
    }
  }
}
// ------------------------------

// Network Type Management Functions
let speedtest_running = false;
let speedtest_result: Speedtest.ResultEvent | undefined = undefined;
let saved_interface: {
  name: string;
  ip_address: string;
  mac_address: string;
  type: string;
  netmask: string;
  gateway_ip: string;
} = {
  name: "",
  ip_address: "",
  mac_address: "",
  type: "",
  netmask: "",
  gateway_ip: "",
};
function convertBandwidth(
  bandwidth: number,
  fromUnit: string,
  toUnit: string
): number {
  let bits = bandwidth * 8;
  const units = ["BPS", "KBPS", "MBPS", "GBPS", "TBPS"];
  const fromIndex = units.indexOf(fromUnit.toUpperCase());
  const toIndex = units.indexOf(toUnit.toUpperCase());

  if (fromIndex === -1 || toIndex === -1) {
    throw new Error("Invalid units");
  }

  const conversionFactor = Math.pow(1000, fromIndex - toIndex);
  let convertedBandwidth = bits * conversionFactor;

  return parseFloat(convertedBandwidth.toFixed(2));
}

function categorizeQuality(
  value: number,
  dependencies: { threshold: number; quality: number }[]
) {
  let quality = 1;

  for (const dependency of dependencies) {
    if (value <= dependency.threshold) {
      quality = dependency.quality;
      break;
    }
  }

  return quality;
}

async function setFilterNetworkType(
  changes: changes,
  errors: any[],
  ctx: IRouterContext
) {
  // Obtaining Information about host connectivity
  let connection_type = "N/A";
  // Obtaining Speedtest Results
  try {
    // Speedtest Runner
    const network = require("network");
    await network.get_active_interface(function (
      err: any,
      obj: {
        name: string;
        ip_address: string;
        mac_address: string;
        type: string;
        netmask: string;
        gateway_ip: string;
      }
    ) {
      if (err) {
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : Unable to get active interface"
        );
        throw new Error("Unable to get active interface");
      } else {
        if (saved_interface.name !== obj.name ||
          saved_interface.ip_address !== obj.ip_address ||
          saved_interface.mac_address !== obj.mac_address ||
          saved_interface.type !== obj.type ||
          saved_interface.netmask !== obj.netmask ||
          saved_interface.gateway_ip !== obj.gateway_ip) {
          console.log(
            chalk.blue(new Date().toLocaleTimeString() +
            ": Network Configuration Changed, Resetting Speedtest Results")
          );
          ctx.request.query.force_test === "true";
          saved_interface = obj;
        }
      }
    });
    connection_type = saved_interface.type === "Wired" ? "ETH" : "WLAN";
    if (
      (speedtest_result === undefined && !speedtest_running) ||
      (ctx.request.query.force_test === "true" && !speedtest_running)
    ) {
      speedtest_running = true;
      speedtest_result = await Speedtest({
        acceptLicense: true,
        acceptGdpr: true,
      });
      speedtest_running = false;
    } else {
      if (speedtest_result === undefined && speedtest_running) {
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : Speedtest is already running"
        );
        throw new Error("Speedtest is already running");
      }
      if (speedtest_result === undefined && !speedtest_running) {
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : No speedtest result available"
        );
        throw new Error("No speedtest result available");
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  // Computing Network Type
  let globalQuality = 0;
  try {
    // Obtaining Speedtest Results
    if (speedtest_result !== undefined && errors.length === 0) {
      // Computing Speedtest Results
      const download = convertBandwidth(
        speedtest_result.download.bandwidth,
        "BPS",
        "MBPS"
      );
      const upload = convertBandwidth(
        speedtest_result.upload.bandwidth,
        "BPS",
        "MBPS"
      );
      const ping = speedtest_result.ping.latency;
      const jitter = speedtest_result.ping.jitter;
      // Computing Levels
      const uploadQuality = categorizeQuality(upload, uploadDependencies) || 0;
      const downloadQuality =
        categorizeQuality(download, downloadDependencies) || 0;
      const pingQuality = categorizeQuality(ping, pingDependencies) || 0;
      const jitterQuality = categorizeQuality(jitter, jitterDependencies) || 0;
      if (
        uploadQuality === 0 ||
        downloadQuality === 0 ||
        pingQuality === 0 ||
        jitterQuality === 0
      ) {
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : Unable to compute Network Quality from Speedtest"
        );
        throw new Error("Unable to compute Network Quality from Speedtest");
      } else {
        globalQuality = Math.max(
          uploadQuality,
          downloadQuality,
          pingQuality,
          jitterQuality
        );
      }
    } else {
      console.log(
        new Date().toLocaleTimeString() +
          ": ERROR : Unable to obtain Speedtest Results"
      );
      throw new Error("Unable to obtain Speedtest Results");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  // Create Change List
  try {
    if (globalQuality !== 0 && errors.length === 0) {
      const actual_filter = getAllClientFilter_LOCAL_USRV();
      actual_filter.forEach((Filter) => {
        let new_filter = split_filter(Filter.filter);
        if (Filter.strict === true) {
          new_filter.NETWORK_TYPE.fill(0);
          new_filter.NETWORK_TYPE.write(`NT${globalQuality}`);
        } else {
          new_filter.NETWORK_TYPE.fill(0);
          new_filter.NETWORK_TYPE.write(`ANY`);
        }
        changes.LOCAL.push({
          identifier: Filter.identifier,
          strict: Filter.strict,
          filter: new_filter,
        });
      });
    } else {
      console.log(
        new Date().toLocaleTimeString() +
          ": ERROR : Global Quality is not valid"
      );
      throw new Error("Global Quality is not valid");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  // Return Result
  try {
    if (
      changes.LOCAL.length !== 0 ||
      ctx.request.query.allow_empty === "true"
    ) {
      if (ctx.request.query.allow_empty === "true") {
      }
    } else {
      console.log(
        new Date().toLocaleTimeString() + ": ERROR : LOCAL Changes is empty"
      );
      throw new Error("LOCAL Changes is empty");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }
  return {
    changes,
    errors,
    new_informations: {
      new_network_type: globalQuality,
      new_connect_type: connection_type,
    },
  };
}
// ------------------------------

// Password Key Management Functions
async function setFilterPasswordKey(
  changes: changes,
  errors: any[],
  ctx: IRouterContext
) {
  // Verify if All Parameters are valid
  let password_key = "";
  try {
    if (
      ctx.request.query.network_key !== undefined &&
      typeof ctx.request.query.network_key === "string" &&
      ctx.request.query.network_key !== "" &&
      ctx.request.query.network_key.length <= 32
    ) {
      password_key = ctx.request.query.network_key;
    } else {
      if (ctx.request.query.random_password === "true") {
        password_key = uuidv4().slice(0, 32);
      } else {
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : Provided Password Key is an invalid value"
        );
        throw new Error("Provided Password Key is an invalid value");
      }
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  try {
    // If Password Key is not valid, return errors
    if (password_key !== "" && password_key.length <= 32) {
      const ip_identifier = ip_calculator_from_position(
        await INDEX_accounts_get_position(ctx.state.user_uuid),
        "1.0.1.0",
        "1.0.255.254",
        "255.0.0.0"
      );
      if (ip_identifier !== undefined) {
        const filter =
          findClientFilter_LOCAL_USRV(ip_identifier) ||
          findClientFilter_EXTERNAL_USRV(ip_identifier);
        if (filter !== undefined) {
          let new_filter = split_filter(filter.filter);
          new_filter.PASSWORD.fill(0);
          new_filter.PASSWORD.write(`PWD_${password_key}`.slice(0, 36));

          if (filter.source === "LOCAL") {
            changes.LOCAL.push({
              identifier: ip_identifier,
              filter: new_filter,
              strict: undefined,
            });
          } else {
            if (filter.source === "EXTERNAL") {
              changes.EXTERNAL.push({
                identifier: ip_identifier,
                filter: new_filter,
              });
            } else {
              // Case unable to obtain filter source
              console.log(
                new Date().toLocaleTimeString() +
                  ": ERROR : Unable to obtain Filter Source, actual data: " +
                  filter.source
              );
              throw new Error("Unable to obtain Filter Source");
            }
          }
        }
      } else {
        // Case unable to obtain ip identifier
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : Unable to obtain IP Identifier"
        );
        throw new Error("Unable to obtain IP Identifier");
      }
    } else {
      // Case stored Password Key is not valid
      console.log(password_key.length);
      console.log(
        new Date().toLocaleTimeString() +
          ": ERROR : Stored Password Key is not valid"
      );
      throw new Error("Stored Password Key is not valid");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  try {
    if (
      errors.length === 0 ||
      (changes.LOCAL.length === 0 && changes.EXTERNAL.length === 0)
    ) {
    } else {
      console.log(
        new Date().toLocaleTimeString() + ": ERROR : No Changes Found"
      );
      throw new Error("No Changes Found");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }
  return {
    changes,
    errors,
    new_informations: {
      new_password: password_key,
    },
  };
}
// ------------------------------

// Geographic Key Management Functions
async function setFilterGeographicKey(
  changes: changes,
  errors: any[],
  ctx: IRouterContext
) {
  // Verify if All Parameters are valid
  let geographic_key = "";
  try {
    if (
      (typeof ctx.request.query.geographic_network_type === "string" &&
        ctx.request.query.geographic_network_type === "WORLD") ||
      (typeof ctx.request.query.geographic_network_type === "string" &&
        ctx.request.query.geographic_network_type === "CONTINENTAL" &&
        typeof ctx.request.query.continent === "string" &&
        ctx.request.query.continent !== "") ||
      (ctx.request.query.geographic_network_type === "COUNTRY" &&
        typeof ctx.request.query.continent === "string" &&
        ctx.request.query.continent !== "" &&
        typeof ctx.request.query.country === "string" &&
        ctx.request.query.country !== "")
    ) {
      if (ctx.request.query.geographic_network_type === "WORLD") {
        geographic_key = "WORLD";
      }
      if (
        ctx.request.query.geographic_network_type === "CONTINENTAL" &&
        typeof ctx.request.query.continent === "string" &&
        ctx.request.query.continent !== ""
      ) {
        geographic_key = ctx.request.query.continent;
      }
      if (
        ctx.request.query.geographic_network_type === "COUNTRY" &&
        typeof ctx.request.query.continent === "string" &&
        ctx.request.query.continent !== "" &&
        typeof ctx.request.query.country === "string" &&
        ctx.request.query.country !== ""
      ) {
        geographic_key = `${ctx.request.query.continent}-${ctx.request.query.country}`;
      }
    } else {
      console.log(
        new Date().toLocaleTimeString() +
          ": ERROR : Provided Data is an invalid value"
      );
      throw new Error("Provided Data Key is an invalid value");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  try {
    // If Geographic Key is not valid, return errors
    if (geographic_key !== "" && geographic_key.length <= 32) {
      const ip_identifier = ip_calculator_from_position(
        await INDEX_accounts_get_position(ctx.state.user_uuid),
        "1.0.1.0",
        "1.0.255.254",
        "255.0.0.0"
      );
      if (ip_identifier !== undefined) {
        const filter =
          findClientFilter_LOCAL_USRV(ip_identifier) ||
          findClientFilter_EXTERNAL_USRV(ip_identifier);
        if (filter !== undefined) {
          let new_filter = split_filter(filter.filter);
          new_filter.PASSWORD.fill(0);
          new_filter.PASSWORD.write(`GEO_${geographic_key}`.slice(0, 36));

          if (filter.source === "LOCAL") {
            changes.LOCAL.push({
              identifier: ip_identifier,
              filter: new_filter,
              strict: undefined,
            });
          } else {
            if (filter.source === "EXTERNAL") {
              changes.EXTERNAL.push({
                identifier: ip_identifier,
                filter: new_filter,
              });
            } else {
              // Case unable to obtain filter source
              console.log(
                new Date().toLocaleTimeString() +
                  ": ERROR : Unable to obtain Filter Source, actual data: " +
                  filter.source
              );
              throw new Error("Unable to obtain Filter Source");
            }
          }
        }
      } else {
        // Case unable to obtain ip identifier
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : Unable to obtain IP Identifier"
        );
        throw new Error("Unable to obtain IP Identifier");
      }
    } else {
      // Case stored Password Key is not valid
      console.log(geographic_key.length);
      console.log(
        new Date().toLocaleTimeString() +
          ": ERROR : Stored Password Key is not valid"
      );
      throw new Error("Stored Password Key is not valid");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  try {
    if (
      errors.length === 0 ||
      (changes.LOCAL.length === 0 && changes.EXTERNAL.length === 0)
    ) {
    } else {
      console.log(
        new Date().toLocaleTimeString() + ": ERROR : No Changes Found"
      );
      throw new Error("No Changes Found");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }
  return {
    changes,
    errors,
    new_informations: {
      new_password: geographic_key,
    },
  };
}
// ------------------------------

// Pool Management Functions
async function setFilterPool(
  changes: changes,
  errors: any[],
  ctx: IRouterContext
) {
  // Verify if All Parameters are valid
  let pool = "";
  try {
    if (
      ctx.request.query.pool !== undefined &&
      typeof ctx.request.query.pool === "string" &&
      ctx.request.query.pool !== "" &&
      ctx.request.query.pool.length <= 36
    ) {
      pool = ctx.request.query.pool;
    } else {
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : Provided pool is an invalid value"
        );
        throw new Error("Provided pool is an invalid value");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  try {
    // If Pool is not valid, return errors
    if (pool !== "" && pool.length <= 36) {
      const ip_identifier = ip_calculator_from_position(
        await INDEX_accounts_get_position(ctx.state.user_uuid),
        "1.0.1.0",
        "1.0.255.254",
        "255.0.0.0"
      );
      if (ip_identifier !== undefined) {
        const filter =
          findClientFilter_LOCAL_USRV(ip_identifier) ||
          findClientFilter_EXTERNAL_USRV(ip_identifier);
        if (filter !== undefined) {
          let new_filter = split_filter(filter.filter);
          new_filter.POOL.fill(0);
          new_filter.POOL.write(`${pool}`.slice(0, 36));

          if (filter.source === "LOCAL") {
            changes.LOCAL.push({
              identifier: ip_identifier,
              filter: new_filter,
              strict: undefined,
            });
          } else {
            if (filter.source === "EXTERNAL") {
              changes.EXTERNAL.push({
                identifier: ip_identifier,
                filter: new_filter,
              });
            } else {
              // Case unable to obtain filter source
              console.log(
                new Date().toLocaleTimeString() +
                  ": ERROR : Unable to obtain Filter Source, actual data: " +
                  filter.source
              );
              throw new Error("Unable to obtain Filter Source");
            }
          }
        }
      } else {
        // Case unable to obtain ip identifier
        console.log(
          new Date().toLocaleTimeString() +
            ": ERROR : Unable to obtain IP Identifier"
        );
        throw new Error("Unable to obtain IP Identifier");
      }
    } else {
      // Case stored Password Key is not valid
      console.log(
        new Date().toLocaleTimeString() +
          ": ERROR : Stored Password Key is not valid"
      );
      throw new Error("Stored Password Key is not valid");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }

  try {
    if (
      errors.length === 0 ||
      (changes.LOCAL.length === 0 && changes.EXTERNAL.length === 0)
    ) {
    } else {
      console.log(
        new Date().toLocaleTimeString() + ": ERROR : No Changes Found"
      );
      throw new Error("No Changes Found");
    }
  } catch (e) {
    if (e instanceof Error) {
      errors.push(e.toString());
    } else {
      errors.push(e);
    }
  }
  return {
    changes,
    errors,
    new_informations: {
      new_pool: pool,
    },
  };
}
// ------------------------------
