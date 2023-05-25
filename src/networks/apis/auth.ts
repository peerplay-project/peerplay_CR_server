import Router from 'koa-router'
import {PeerplaySettings} from "../../interface";
import {register,login,resetPassword} from "../../databases/DB_accounts/main";
interface register_query {
  username: string, email: string, password: string, confirmPassword: string
}
interface login_query {email: string, password: string}
interface reset_password_query {email: string, newPassword: string, confirmNewPassword: string,resetKey: string | undefined,oldPassword: string | undefined}
export class AuthRouter {
  public router = new Router()
  constructor() {
    // Auth Router Routes
    this.router.post('/auth/register', async (ctx, next) => {
      try {
        //@ts-ignore
        const register_request: register_query = {username: ctx.request.query.username, email: ctx.request.query.email, password: ctx.request.query.password, confirmPassword: ctx.request.query.confirmPassword}
        const result = await register(PeerplaySettings, register_request.username, register_request.email, register_request.password, register_request.confirmPassword);
        if (result.status === 'SUCCESS'){
          ctx.status = 200;
          ctx.type = 'application/json'
          ctx.body = {
            status: 'SUCCESS',
            code: result.CODE,
            account_data: result.DATA
          }
        }
        else
        {
          ctx.status = 400;
          ctx.type = 'application/json'
          ctx.body = {
            status: 'ERROR',
            code: result.CODE,
          }
        }
      } catch(error) {
        ctx.status = 400;
        ctx.type = 'application/json'
        ctx.body = {
          error: error
        }
      }
    });
    this.router.post('/auth/login', async (ctx, next) => {
      try {
        //@ts-ignore
        const login_request: login_query = {email: ctx.request.query.email, password: ctx.request.query.password}
        const result = await login(PeerplaySettings,login_request.email, login_request.password)
        if (result.status === 'SUCCESS' && result.JWT_TOKEN !== undefined){
          ctx.status = 200;
          ctx.type = 'application/json'
          ctx.body = {
            status: 'SUCCESS',
            code: result.CODE,
            username: result.username,
            jwt: result.JWT_TOKEN
          }
        }
        else{
          ctx.status = 401;
          ctx.type = 'application/json'
          ctx.body = {
            status: 'ERROR',
            code: result.CODE,
          }
        }
      } catch(error) {
        ctx.status = 400;
        ctx.type = 'application/json'
        ctx.body = {
          error: error
        }
      }
    });
    this.router.post('/auth/reset_password', async (ctx, next) => {
      try{
        //@ts-ignore
        const reset_password_query: reset_password_query = {email: ctx.request.query.email, resetKey: ctx.request.query.resetKey,oldPassword: ctx.request.query.oldPassword, newPassword: ctx.request.query.newPassword, confirmNewPassword: ctx.request.query.confirmNewPassword}
        const result = await resetPassword(PeerplaySettings,reset_password_query.email, reset_password_query.resetKey,reset_password_query.oldPassword, reset_password_query.newPassword, reset_password_query.confirmNewPassword)
        if (result.status === 'SUCCESS'){
          ctx.status = 200;
          ctx.type = 'application/json'
          ctx.body = {
            status: 'SUCCESS',
            code: result.CODE,
            account_data: result.DATA
          }
        }
        else
        {
          ctx.status = 401;
          ctx.type = 'application/json'
          ctx.body = {
            status: 'ERROR',
            code: result.CODE,
          }
        }
      }
      catch(error){
        ctx.status = 400;
        ctx.type = 'application/json'
        ctx.body = {
          error: error
        }
      }
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
}

