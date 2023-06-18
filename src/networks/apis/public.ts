import Router, { IRouterContext } from 'koa-router'
import yamljs from "yamljs";
import { koaSwagger } from "koa2-swagger-ui";
import { get_server_info, get_server_size } from "../public/network";
import { parseToken } from "../../databases/DB_accounts/main";
import Koa from "koa";
import { INDEX_accounts_get_position } from "../../databases/indexes/accounts/main";
import { ip_calculator_from_position } from "../toolkit";
import { findClientFilter_LOCAL_USRV, setClientFilter_LOCAL_USRV } from '../public/components/entrypoints/local';
import { findClientFilter_EXTERNAL_USRV, setClientFilter_EXTERNAL_USRV } from '../public/components/entrypoints/external';
import { v4 as uuidv4 } from 'uuid';
const unprotectedRoutes = [
  '/network/general/status',
  '/swagger',
  '/auth/swagger',
  '/auth/register',
  '/auth/login',
  '/auth/reset_password',
];

const PEERPLAY_HEADER = Buffer.alloc(9); // buffer de taille 9
PEERPLAY_HEADER.write("peerplay:");
const DASH = Buffer.alloc(1); // buffer de taille 1
DASH.write("-");
const SLASH = Buffer.alloc(1); // buffer de taille 1
SLASH.write("/");

const jwtMiddleware: Router.IMiddleware<any, Koa.DefaultState> = async (ctx, next) => {
  // Vérifier si la route actuelle doit être ignorée
  if (unprotectedRoutes.includes(ctx.path)) {
    await next(); // Passer au middleware suivant
    return;
  }

  // Récupérer le JWT depuis les en-têtes de requête
  const token = `${ctx.headers.authorization}`.split(" ")[1]

  // Vérifier le JWT
  if (!token) {
    ctx.status = 401;
    ctx.body = {
      CODE: "MISSING_JWT",
      MESSAGE: "The JWT is missing, please provide it in the Authorization header"
    };
    return;
  }

  const decodedToken = await parseToken(token);
  if (typeof (decodedToken) === "string") {
    ctx.state.user_uuid = decodedToken;
    await next(); // Passer au middleware suivant
  }
  else {
    if (decodedToken === undefined) {
      ctx.status = 401;
      ctx.body = {
        CODE: "INVALID_JWT",
        MESSAGE: "The JWT is invalid, please provide a valid JWT"
      };
      return;
    }
    else {
      // @ts-ignore
      switch (decodedToken.message) {
        case "invalid signature":
          ctx.status = 401;
          ctx.body = {
            CODE: "INVALID_JWT_SIGNATURE", MESSAGE: "The JWT Signature is invalid please regenerate JWT"
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
  public router = new Router()

  constructor() {
    // Setup Swagger UI
    const path = require('path');
    const swaggerFilePath = path.join(__dirname, 'swagger', 'public.yaml');
    const swagger = yamljs.load(swaggerFilePath);
    // Utilisation du middleware sur le routeur
    this.router.use(jwtMiddleware);
    // Public Router Routes (No Auth)
    this.router.get('/network/general/status', async ctx => {
      await this.handleGetInfo(ctx)
    })
    this.router.get('/swagger', async (ctx, next) => {
      // Récupérer l'adresse IP du client
      const clientIP = ctx.request.ip;

      // Vérifier si l'adresse IP du client est dans le Localhost
      if ((clientIP !== '127.0.0.1' && clientIP !== '::1')) {
        ctx.status = 403; // Accès interdit
        ctx.body = "Accès refusé : La Documentation Swagger est uniquement accessible en Localhost"
      } else {
        await next();
      }
    }, koaSwagger({ routePrefix: false, swaggerOptions: { spec: swagger } }));
    // Public Router Routes (Require Authentication)
    this.router.get('/console/ip_settings/get_ip_address', async (ctx) => {
      await this.handleGetIpAddress(ctx)
    });
    this.router.get('/account/filter/filter_settings', async (ctx) => {
      await this.getFilter(ctx)
    });
    this.router.post('/account/filter/filter_settings/network_type', async (ctx) => {
      await this.setFilter("NETWORK_TYPE", ctx)
    });
    this.router.post('/account/filter/filter_settings/password_key', async (ctx) => {
      await this.setFilter("PASSWORD_KEY", ctx)
    });
    this.router.post('/account/filter/filter_settings/geographic_key', async (ctx) => {
      await this.setFilter("GEOGRAPHIC_KEY", ctx)
    });
    this.router.all('*', async (ctx, next) => {
      try {
        await next()
      } catch (err) {
        console.error(err)
        ctx.status = 500
        ctx.body = {
          error: 'server exceptions'
        }
      }
    })
  }

  private async handleGetInfo(ctx: IRouterContext) {
    const network_size = get_server_size()
    const slp_ports = get_server_info()
    let external_ip
    if (slp_ports.external_local === 0) {
      external_ip = 'DISABLED'
    } else {
      external_ip = `${slp_ports.address}:${slp_ports.external_internet}`
    }
    ctx.type = 'application/json'
    ctx.body = {
      online: network_size,
      external_ip: external_ip,
    }
  }
  private async handleGetIpAddress(ctx: IRouterContext) {
    const ip_identifier = ip_calculator_from_position(await INDEX_accounts_get_position(ctx.state.user_uuid), "1.0.1.0", "1.0.255.254", "255.0.0.0")
    if (ip_identifier !== undefined) {
      ctx.status = 200
      ctx.type = 'application/json'
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
        }
      }
    }
    else {
      ctx.status = 503
      ctx.type = 'application/json'
      ctx.body = {
        status: "ERROR",
        code: "USER_POSITION_OUT_OF_RANGE",
      }
    }
  }

  private async getFilter(ctx: Koa.Context) {
    const ip_identifier = ip_calculator_from_position(await INDEX_accounts_get_position(ctx.state.user_uuid), "1.0.1.0", "1.0.255.254", "255.0.0.0")
    if (ip_identifier !== undefined) {
      const current_filter: {
        source: string;
        filter: Buffer;
      } | undefined = findClientFilter_LOCAL_USRV(ip_identifier) || findClientFilter_EXTERNAL_USRV(ip_identifier)
      if (current_filter !== undefined) {
        ctx.type = 'application/json'
        ctx.body = {
          message: 'success',
          actual_filter: {
            network_type: current_filter.filter.slice(9, 12).toString(), // NETWORK_TYPE est entre 9 et 12
            connect_type: current_filter.filter.slice(12, 16).toString().split('\0')[0], // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
            password: current_filter.filter.slice(17, 53).toString().split('\0')[0],
            pool: current_filter.filter.slice(54, 90).toString().split('\0')[0]
          }
        }
      }
      else
      {
        ctx.type = 'application/json'
        ctx.body = {
          message: 'error',
          actual_filter: "NO_FILTER_FOUND"
        }
      }
    }
  }

  private async setFilter(method: string, ctx: IRouterContext) {
    const ip_identifier = ip_calculator_from_position(await INDEX_accounts_get_position(ctx.state.user_uuid), "1.0.1.0", "1.0.255.254", "255.0.0.0")
    if (ip_identifier !== undefined) {
      const current_filter: {
        source: string;
        filter: Buffer;
      } | undefined = findClientFilter_LOCAL_USRV(ip_identifier) || findClientFilter_EXTERNAL_USRV(ip_identifier)
      if (current_filter !== undefined) {
        try {
          let filter_settings_processed = false
          let filter_settings_error = ""
          const NETWORK_TYPE = current_filter.filter.slice(9, 12) // NETWORK_TYPE est entre 9 et 12
          const CONNECT_TYPE = current_filter.filter.slice(12, 16) // CONNECT_TYPE est entre 13 et 16 et on enlève les zéros
          const PASSWORD = current_filter.filter.slice(17, 53)// PASSWORD est entre 13 et 52 et on enlève les zéros
          const POOL = current_filter.filter.slice(54, 90) // POOL est entre 52 et 90 et on enlève les zéros
          console.log("Sliced Filter")
          switch (method) {
            case "NETWORK_TYPE":
              console.log("Selected : NETWORK_TYPE")
              // @ts-ignore
              if (typeof (ctx.request.query.network_type) === "string" && ctx.request.query.network_type !== "" && (ctx.request.query.network_type === "NT1" || ctx.request.query.network_type === "NT2" || ctx.request.query.network_type === "NT3" || ctx.request.query.network_type === "ANY")) {
                // @ts-ignore
                NETWORK_TYPE.fill(0);
                NETWORK_TYPE.write(ctx.request.query.network_type.slice(0, 3));
                filter_settings_processed = true
              }
              else {
                filter_settings_error = "Missing Arguments or Invalid Arguments Provided Network Type Must Be 'NT1', 'NT2', 'NT3', or 'ANY'"
              }
              break
            case "GEOGRAPHIC_KEY":
              console.log("Selected : GEOGRAPHIC_KEY")
              // @ts-ignore
              if (ctx.request.query.geographic_network_type === "WORLD") {
                console.log("World Selected")
                PASSWORD.fill(0);
                PASSWORD.write("GEO-WORLD");
                filter_settings_processed = true
              }
              else {
                // @ts-ignore
                const position = { continent: `${ctx.request.query.continent}`, country: `${ctx.request.query.country}` }
                console.log("Get Position")
                if (typeof position.continent === 'string' && typeof position.country === 'string') {
                  console.log("Position is String Convert to Geocode")
                  const geocode = {
                    CONTINENTAL: `GEO-${position.continent.toUpperCase()}`,
                    COUNTRY: `GEO-${position.continent.toUpperCase()}_${position.country.toUpperCase()}`
                  }
                  // @ts-ignore
                  const selected_geocode = geocode[ctx.request.query.geographic_network_type]
                  console.log("Selected Geocode")
                  PASSWORD.fill(0);
                  PASSWORD.write(selected_geocode.slice(0, 36));
                  filter_settings_processed = true
                }
                else {
                  filter_settings_error = "Missing or Invalid Arguments: continent or/and country value missing"
                }
              }
              break
            case "PASSWORD_KEY":
              // @ts-ignore
              console.log(ctx.request.query.network_key)
              if (ctx.request.query.random_password !== "true" && ctx.request.query.network_key !== undefined && ctx.request.query.network_key.length <= 32) {
                console.log("set a Custom Password")
                PASSWORD.fill(0);
                console.log("Fill Password with 0")
                // @ts-ignore
                PASSWORD.write(`PWD-${ctx.request.query.network_key.slice(0, 32)}`);
                console.log("Write Password")
                filter_settings_processed = true
                console.log("Custom Password Set Successfully")
              }
              else {
                // @ts-ignore
                if (ctx.request.query.random_password === "true") {
                  console.log("set a Prégenerated Password")
                  PASSWORD.fill(0);
                  console.log("Fill Password with 0")
                  // @ts-ignore
                  PASSWORD.write(`PWD-${uuidv4().slice(0, 32)}`);
                  console.log("Write Password")
                  filter_settings_processed = true
                  console.log("Custom Password Set Successfully")
                }
                else {
                  filter_settings_error = "Missing or Invalid Arguments: if you want a custom password : Password must be a string (limited to 32 characters)"
                }
              }
              break
            default:
              filter_settings_error = "Invalid Method"
          }
          if (filter_settings_processed) {
            console.log("Filter Settings Processed Successfully, Encoding Filter")
            let filter_settings_changed = false;
            let data: Buffer | undefined
            let verify: Buffer = Buffer.alloc(90)
            console.log("Source Calculation")
            switch (current_filter.source) {
              case "LOCAL":
                console.log("Set a local filter")
                setClientFilter_LOCAL_USRV(ip_identifier, Buffer.concat([PEERPLAY_HEADER, NETWORK_TYPE, CONNECT_TYPE, DASH, PASSWORD, SLASH, POOL]))
                data = findClientFilter_LOCAL_USRV(ip_identifier)?.filter
                if (data !== undefined){
                  verify = data
                  filter_settings_changed = true
                }
                break;
              case "EXTERNAL":
                console.log("Set a external filter")
                setClientFilter_EXTERNAL_USRV(ip_identifier, Buffer.concat([PEERPLAY_HEADER, NETWORK_TYPE, CONNECT_TYPE, DASH, PASSWORD, SLASH, POOL]))
                data = findClientFilter_EXTERNAL_USRV(ip_identifier)?.filter
                if (data !== undefined) {
                  verify = data
                  filter_settings_changed = true
                }
                break;
              default:
                ctx.status = 400
                ctx.type = 'application/json'
                ctx.body = {
                  message: 'Error',
                  output: "Unable to identify source of ip_identifier"
                }
                break;
            }
            console.log("Filter Settings Changed, Verifying changes")
            if (filter_settings_changed && verify.equals(Buffer.concat([PEERPLAY_HEADER, NETWORK_TYPE, CONNECT_TYPE, DASH, PASSWORD, SLASH, POOL]))) {
              ctx.status = 200
              ctx.type = 'application/json'
              ctx.body = {
                message: 'success'
              }
            }
            else {
              if (filter_settings_changed === true) {
                ctx.status = 400
                ctx.type = 'application/json'
                ctx.body = {
                  status: 'ERROR',
                  output: "Filter Test Failed"
                }
              }
              else {
                ctx.status = 400
                ctx.type = 'application/json'
                ctx.body = {
                  status: 'ERROR',
                  output: "Unable to change filter"
                }
              }
            }
          }
          else {
            ctx.status = 400
            ctx.type = 'application/json'
            ctx.body = {
              status: 'ERROR',
              output: filter_settings_error
            }
          }
        } catch (error) {
          ctx.type = 'application/json'
          ctx.body = {
            status: 'ERROR',
            output: error
          }
        }
      }
      else {
        ctx.status = 503
        ctx.type = 'application/json'
        ctx.body = {
          status: "ERROR",
          code: "Identifier not found on the filter storage",
        }

      }
    }
    else {
      ctx.status = 503
      ctx.type = 'application/json'
      ctx.body = {
        status: "ERROR",
        code: "User is out of range, please open a issue",
      }
    }
  }

}
