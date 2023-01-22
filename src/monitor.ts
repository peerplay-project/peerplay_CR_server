import Koa from 'koa'
import cors from 'koa2-cors'
import Router, { IRouterContext } from 'koa-router'
import { SLPServer } from './slpserver'
import { join } from 'path'
const pkg = require(join(__dirname, '..', 'package.json'))

export class ServerMonitor {
  private private_router = new Router()
  private private_app = new Koa()
  private public_router = new Router()
  private public_app = new Koa()

  constructor(private server: SLPServer) {
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
    this.public_router.get('/status', async ctx => { this.handleGetInfo(ctx) })
  }
  public start(public_port: number, private_port: number) {
    this.public_app.use(cors())
    this.public_app.use(this.public_router.routes())
    this.public_app.listen(public_port)
  }

  private async handleGetInfo(ctx: IRouterContext) {
    const network_size = this.server.getClientSize()
    const slp_ports = this.server.getSLPPort()
    let p2p_relay_ip
    let external_ip
    p2p_relay_ip = `${slp_ports.ip}:${slp_ports.interserver}`
    if (slp_ports.external === 0) {
      external_ip = 'DISABLED'
    }
    else {
      external_ip = `${slp_ports.ip}:${slp_ports.external}`
    }
    ctx.type = 'application/json'
    ctx.body = {
      online: network_size,
      p2p_relay_ip: p2p_relay_ip,
      external_ip: external_ip,
      version: pkg.version
    }
  }
}
