import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createChildLogger } from '@shared/logger'

const log = createChildLogger('http')

export function applyMiddleware(app: Hono): void {
  // CORS
  app.use('*', cors({
    origin: ['http://localhost:3000', 'http://localhost:8787'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }))

  // Request logging
  app.use('*', async (c, next) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    log.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms }, 'request')
  })

  // Error handler
  app.onError((err, c) => {
    log.error({ err: err.message, stack: err.stack, path: c.req.path }, 'Unhandled error')
    return c.json({ error: 'Internal server error' }, 500)
  })
}
