import Koa from 'koa'
import cors from 'koa2-cors'
import Router, { IRouterContext } from 'koa-router' 
import { get_server_info, get_server_size, get_router_log } from './public/network'

export class ServerMonitor {
  private private_router = new Router()
  private private_app = new Koa()
  private public_router = new Router()
  private public_app = new Koa()

  constructor() {
    // Private Router Logs
    this.private_router.all('*', async (ctx, next) => {
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
    this.private_router.get('/status', async ctx => { this.handleGetInfo(ctx) })
    this.private_router.get('/logs', async ctx => { this.getLogs(ctx) })
    // Public Router Logs
    this.public_router.all('*', async (ctx, next) => {
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
    this.public_router.get('/accounts/register', async ctx => { this.getLogs(ctx) })
    this.public_router.get('/accounts/login', async ctx => { this.getLogs(ctx) })
  }
  public start(public_port: number, private_port: number) {
    // Start Public API
    this.public_app.use(cors())
    this.public_app.use(this.public_router.routes())
    this.public_app.listen(public_port)
    // Start Private API
    this.private_app.use(cors())
    this.private_app.use(this.private_router.routes())
    this.private_app.listen(private_port)
  }

  private async handleGetInfo(ctx: IRouterContext) {
    const network_size = get_server_size()
    const slp_ports = get_server_info()
    let p2p_relay_ip
    let external_ip
    p2p_relay_ip = `${slp_ports.address}:${slp_ports.interserver}`
    if (slp_ports.external === 0) {
      external_ip = 'DISABLED'
    }
    else {
      external_ip = `${slp_ports.address}:${slp_ports.external}`
    }
    ctx.type = 'application/json'
    ctx.body = {
      online: network_size,
      p2p_relay_ip: p2p_relay_ip,
      external_ip: external_ip,
    }
  }

  private async getLogs(ctx: IRouterContext) {
    let log = ''
    get_router_log().forEach(router_log => {
      log = log + `${router_log}\n`
    })
    ctx.type = 'application/json'
    ctx.body = log
  }
}
