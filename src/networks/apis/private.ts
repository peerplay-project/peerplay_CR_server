import Koa from "koa";
import Router, { IRouterContext } from "koa-router";
import {
  get_server_info,
  get_server_size,
  get_router_log,
  change_filter_settings,
  get_filter_settings,
} from "../public/network";
import { koaSwagger } from "koa2-swagger-ui";
import yamljs from "yamljs";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { external_server_started } from "../public/components/entrypoints/external";
interface FilterSettings {
  network_type: string;
  password: string;
  strict_mode: boolean;
}
const network = require("network");
function getActiveInterfaceType() {
  return new Promise((resolve, reject) => {
    network.get_active_interface((err: any, obj: unknown) => {
      if (err) {
        reject(err);
      } else {
        // @ts-ignore
        resolve(obj.type);
      }
    });
  });
}

export class PrivateRouter {
  public router = new Router();

  constructor() {
    // Setup Swagger UI
    const path = require("path");
    const swaggerFilePath = path.join(__dirname, "swagger", "private.yaml");
    const swagger = yamljs.load(swaggerFilePath);
    this.router.get(
      "/swagger",
      async (ctx, next) => {
        // Récupérer l'adresse IP du client
        const clientIP = ctx.request.ip;

        // Vérifier si l'adresse IP est localhost
        if (clientIP !== "127.0.0.1" && clientIP !== "::1") {
          ctx.status = 403; // Accès interdit
          ctx.body =
            "Accès refusé : La Documentation Swagger n'est accessible que depuis localhost;";
        } else {
          await next();
        }
      },
      koaSwagger({ routePrefix: false, swaggerOptions: { spec: swagger } })
    );
    // Private Router Routes
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
    this.router.get(
      "/filter/filter_settings",
      async (ctx: Koa.Context, next) => {
        await this.getFilter(ctx, next);
      }
    );
    this.router.post(
      "/filter/filter_settings/network_type",
      async (ctx: Koa.Context, next) => {
        await this.setFilter("NETWORK_TYPE", ctx, next);
      }
    );
    this.router.post(
      "/filter/filter_settings/password_key",
      async (ctx: Koa.Context, next) => {
        await this.setFilter("PASSWORD_KEY", ctx, next);
      }
    );
    this.router.post(
      "/filter/filter_settings/geographic_key",
      async (ctx: Koa.Context, next) => {
        await this.setFilter("GEOGRAPHIC_KEY", ctx, next);
      }
    );
    this.router.post(
      "/filter/filter_settings/strict_mode",
      async (ctx: Koa.Context, next) => {
        await this.setFilter("STRICT_MODE", ctx, next);
      }
    );
    this.router.get(
      "/network/general/network_info",
      async (ctx: Koa.Context, next) => {
        await this.getNetworkInfo(ctx, next);
      }
    );
    this.router.get("/network/general/status", async (ctx) => {
      await this.handleGetInfo(ctx);
    });
    this.router.get("/network/router/logs", async (ctx) => {
      await this.getLogs(ctx);
    });
  }

  private async handleGetInfo(ctx: IRouterContext) {
    const network_size = get_server_size();
    const slp_ports = get_server_info();
    let p2p_relay_ip;
    let external_ip;
    p2p_relay_ip = `${slp_ports.address}:${slp_ports.interserver_internet}`;
    if (slp_ports.external_local === 0) {
      external_ip = "DISABLED";
    } else {
      external_ip = `${slp_ports.address}:${slp_ports.external_internet}`;
    }
    ctx.type = "application/json";
    ctx.body = {
      online: network_size,
      p2p_relay_ip: p2p_relay_ip,
      external_ip: external_ip,
    };
  }

  private async getLogs(ctx: IRouterContext) {
    let log = "";
    get_router_log().forEach((router_log) => {
      log = log + `${router_log}\n`;
    });
    ctx.type = "application/json";
    ctx.body = log;
  }

  private async getNetworkInfo(ctx: Koa.Context, next: Koa.Next) {
    let active_interface = await getActiveInterfaceType();
    if (active_interface !== undefined) {
      ctx.type = "application/json";
      ctx.body = {
        message: "success",
        output: active_interface,
      };
    } else {
      ctx.type = "application/json";
      ctx.body = {
        message: "error",
        output: undefined,
      };
    }
  }

  private async getFilter(ctx: Koa.Context, next: Koa.Next) {
    ctx.type = "application/json";
    ctx.body = {
      message: "success",
      output: get_filter_settings(),
    };
  }
  private async setFilter(method: string, ctx: Koa.Context, next: Koa.Next) {
    try {
      let filter_settings: FilterSettings = {
        network_type: "",
        password: "",
        strict_mode: false,
      };
      let filter_settings_processed = false;
      let filter_settings_error = "";
      if (external_server_started === false) {
        switch (method) {
          case "NETWORK_TYPE":
            // @ts-ignore
            if (
              typeof ctx.request.query.network_type === "string" &&
              ctx.request.query.network_type !== "" &&
              (ctx.request.query.network_type === "NT1" ||
                ctx.request.query.network_type === "NT2" ||
                ctx.request.query.network_type === "NT3" ||
                ctx.request.query.network_type === "ANY")
            ) {
              // @ts-ignore
              filter_settings.network_type = ctx.request.query.network_type;
              filter_settings_processed = true;
            } else {
              filter_settings_error =
                "Missing Arguments or Invalid Arguments Provided Network Type Must Be 'NT1', 'NT2', 'NT3', or 'ANY'";
            }
            break;
          case "GEOGRAPHIC_KEY":
            // @ts-ignore
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
                filter_settings.password = "GEO_WORLD";
                filter_settings_processed = true;
              }
              if (
                ctx.request.query.geographic_network_type === "CONTINENTAL" &&
                typeof ctx.request.query.continent === "string" &&
                ctx.request.query.continent !== ""
              ) {
                filter_settings.password = `GEO_${ctx.request.query.continent}`;
                filter_settings_processed = true;
              }
              if (
                ctx.request.query.geographic_network_type === "COUNTRY" &&
                typeof ctx.request.query.continent === "string" &&
                ctx.request.query.continent !== "" &&
                typeof ctx.request.query.country === "string" &&
                ctx.request.query.country !== ""
              ) {
                filter_settings.password = `GEO_${ctx.request.query.continent}-${ctx.request.query.country}`;
                filter_settings_processed = true;
              }
            } else {
              filter_settings_error =
                "Missing or Invalid Arguments: continent or/and country value missing";
            }
            break;
          case "PASSWORD_KEY":
            // @ts-ignore
            if (
              typeof ctx.request.query.network_key === "string" &&
              ctx.request.query.network_key !== "" &&
              ctx.request.query.network_key.length <= 29 &&
              typeof ctx.request.query.allow_cheats === "string" &&
              (ctx.request.query.allow_cheats === "true" ||
                ctx.request.query.allow_cheats === "false") &&
              typeof ctx.request.query.allow_mods === "string" &&
              (ctx.request.query.allow_mods === "true" ||
                ctx.request.query.allow_mods === "false")
            ) {
              // @ts-ignore
              filter_settings.password = `PWD_${ctx.request.query.allow_mods === "true" ? "M":"O"}${ctx.request.query.allow_cheats === "true" ? "C":"L"}_${ctx.request.query.network_key.slice(0, 29)}`;
              filter_settings_processed = true;
            } else {
              // @ts-ignore
              if (ctx.request.query.network_key === "") {
                // @ts-ignore
                filter_settings.password = `PWD_${ctx.request.query.allow_mods === "true" ? "M":"O"}${ctx.request.query.allow_cheats === "true" ? "C":"L"}_${uuidv4().slice(0, 29)}`;
                filter_settings_processed = true;
              } else {
                filter_settings_error =
                  "Missing or Invalid Arguments: Password must be a string (not empty and limited to 29 characters)";
              }
            }
            break;
          case "STRICT_MODE":
            // @ts-ignore
            if (typeof Boolean(ctx.request.query.strict_mode) === "boolean") {
              // @ts-ignore
              filter_settings.strict_mode = Boolean(
                ctx.request.query.strict_mode
              );
              filter_settings_processed = true;
            } else {
              filter_settings_error =
                "Missing or Invalid Arguments: Strict Mode must be a boolean";
            }
            break;
          default:
            filter_settings_error = "Invalid Method";
        }
      }
      else
      {
        filter_settings_error = "External Server is Running, Filter Settings Cannot Be Changed";
      }
      if (filter_settings_processed) {
        change_filter_settings(
          method,
          filter_settings.network_type,
          filter_settings.password,
          "",
          filter_settings.strict_mode
        );
        ctx.status = 200;
        ctx.type = "application/json";
        ctx.body = {
          message: "success",
          new_informations: {
            network_type: filter_settings.network_type,
            password: filter_settings.password,
            strict_mode: filter_settings.strict_mode,

          }
        };
      } else {
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = {
          message: "Error",
          output: filter_settings_error,
        };
      }
    } catch (error) {
      ctx.type = "application/json";
      ctx.body = {
        error: error,
      };
    }
  }
}
