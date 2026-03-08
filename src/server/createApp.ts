import { Hono } from 'hono'
import { applyMiddleware } from './middleware'
import { registerRoutes } from './routes'
import type { Container } from './container'

export function createApp(container: Container): Hono {
  const app = new Hono()
  applyMiddleware(app)
  registerRoutes(app, container)
  return app
}
