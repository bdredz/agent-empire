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

  // Rate Limiting (in-memory)
  const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? '100')
  const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? '60000') // 1 minute default
  const ratelimitMap = new Map<string, { count: number; resetAt: number }>()

  // Cleanup interval
  setInterval(() => {
    const now = Date.now()
    for (const [key, val] of ratelimitMap.entries()) {
      if (now > val.resetAt) {
        ratelimitMap.delete(key)
      }
    }
  }, 60000).unref?.() // Use unref if possible so it doesn't block exit

  app.use('*', async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? '127.0.0.1'
    const now = Date.now()
    let record = ratelimitMap.get(ip)

    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
      ratelimitMap.set(ip, record)
    }

    if (record.count >= RATE_LIMIT_MAX) {
      log.warn({ ip, rateLimitMax: RATE_LIMIT_MAX }, 'Rate limit exceeded')
      c.header('Retry-After', Math.ceil((record.resetAt - now) / 1000).toString())
      return c.json({ error: 'Too many requests' }, 429)
    }

    record.count++
    c.header('X-RateLimit-Limit', RATE_LIMIT_MAX.toString())
    c.header('X-RateLimit-Remaining', (RATE_LIMIT_MAX - record.count).toString())
    c.header('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000).toString())

    await next()
  })

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
