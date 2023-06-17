import Router, {IRouterContext} from 'koa-router'
import yamljs from "yamljs";
import {koaSwagger} from "koa2-swagger-ui";
import {get_server_info, get_server_size} from "../public/network";
import {parseToken} from "../../databases/DB_accounts/main";
import Koa from "koa";
import {INDEX_accounts_get_position} from "../../databases/indexes/accounts/main";
import {ip_calculator_from_position} from "../toolkit";
const unprotectedRoutes = [
  '/network/general/status',
  '/swagger',
  '/auth/swagger',
  '/auth/register',
  '/auth/login',
  '/auth/reset_password',
];

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
    ctx.body = {CODE:"MISSING_JWT",
      MESSAGE:"The JWT is missing, please provide it in the Authorization header"};
    return;
  }

  const decodedToken = await parseToken(token);
  if (typeof(decodedToken) === "string")
  {
    ctx.state.user_uuid = decodedToken;
    await next(); // Passer au middleware suivant
  }
  else
  {
  if (decodedToken === undefined) {
    ctx.status = 401;
    ctx.body = {CODE:"INVALID_JWT",
      MESSAGE:"The JWT is invalid, please provide a valid JWT"};
    return;
  }
  else
  {
    // @ts-ignore
    switch (decodedToken.message){
      case "invalid signature":
        ctx.status = 401;
        ctx.body = {
          CODE: "INVALID_JWT_SIGNATURE", MESSAGE: "The JWT Signature is invalid please regenerate JWT"
        };
        return;
      default:
        ctx.status = 401;
        // @ts-ignore
        ctx.body = {CODE: "INVALID_JWT", MESSAGE: decodedToken.message};
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
      if ((clientIP !== '127.0.0.1' && clientIP !== '::1')){
        ctx.status = 403; // Accès interdit
        ctx.body = "Accès refusé : La Documentation Swagger est uniquement accessible en Localhost"
      } else {
        await next();
      }
    }, koaSwagger({ routePrefix: false, swaggerOptions: { spec: swagger } }));
    // Public Router Routes (Require Authentication)
    this.router.get('/console/ip_settings/get_ip_address', async (ctx, next) => {
      await this.handleGetIpAddress(ctx)
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
    if (ip_identifier !== undefined){
      ctx.status = 200
      ctx.type = 'application/json'
      ctx.body = {
        status: "SUCCESS",
        code:"IP_ADDRESS_FOUND",
        console_ip: {
          PS3: "1."+ip_identifier,
          XBOX_360: "2."+ip_identifier,
          PS4: "3."+ip_identifier,
          XBOX_ONE: "4."+ip_identifier ,
          SWITCH: "5."+ip_identifier,
          PS5: "6."+ip_identifier,
          XBOX_SERIES: "7."+ip_identifier,
        },
        console_gateway: {
          PS3: "1."+"0.0.1",
          XBOX_360: "2."+"0.0.1",
          PS4: "3."+"0.0.1",
          XBOX_ONE: "4."+"0.0.1" ,
          SWITCH: "5."+"0.0.1",
          PS5: "6."+"0.0.1",
          XBOX_SERIES: "7."+"0.0.1",
        }
      }
    }
    else
    {
      ctx.status = 503
      ctx.type = 'application/json'
      ctx.body = {
        status: "ERROR",
        code:"USER_POSITION_OUT_OF_RANGE",
      }
    }
  }

}

