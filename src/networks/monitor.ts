import Koa from 'koa'
import cors from 'koa2-cors'
import bodyParser from 'koa-bodyparser'

import {PrivateRouter} from "./apis/private";
import {PublicRouter} from "./apis/public";
import {setJwtSecret} from "./toolkit";
import {AuthRouter} from "./apis/auth";
export class ServerMonitor {

  private private_app = new Koa()
  private public_app = new Koa()
  private private: PrivateRouter;
  private public: PublicRouter;
  private auth: AuthRouter;

  constructor() {
    // Private Router Logs
    this.private = new PrivateRouter
    this.public = new PublicRouter
    this.auth = new AuthRouter
  }
  public start(public_port: number, private_port: number, JWT_KEY: string)
    { // Edit JWT_SECRET
      setJwtSecret(JWT_KEY);
      // Start Public API
      this.public_app.use(cors())
      this.public_app.use(bodyParser())
      this.public_app.use(this.public.router.routes())
      this.public_app.use(this.auth.router.routes())
      this.public_app.listen(public_port)
      // Start Private API

      this.private_app.use(cors())
      this.private_app.use(bodyParser())
      this.private_app.use(this.private.router.routes())
      this.private_app.listen(private_port)
    }


  }
