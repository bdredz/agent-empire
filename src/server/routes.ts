import { Hono } from 'hono'
import type { Container } from './container'
import { createChildLogger } from '@shared/logger'
import type { AgentId, BusinessId } from '@shared/types'

const log = createChildLogger('routes')

export function registerRoutes(app: Hono, container: Container): void {
  const { factory, governor, mechanic, jarvis, librarian } = container

  // Health
  app.get('/health', (c) => c.json({
    status: 'ok',
    uptime: process.uptime(),
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
  }))

  // Jarvis — goal processing
  app.post('/api/goals', async (c) => {
    const { goal } = await c.req.json<{ goal: string }>()
    log.info({ goal }, 'Processing goal')
    const result = await jarvis.processGoal(goal)
    return c.json(result)
  })

  app.post('/api/goals/:goalId/execute', async (c) => {
    const body = await c.req.json()
    log.info('Executing DAG')
    const result = await jarvis.executeDAG(body.dag)
    return c.json(result)
  })

  // Factory — agent CRUD
  app.post('/api/agents', async (c) => {
    const request = await c.req.json()
    const result = await factory.createAgent(request)
    return c.json(result, result.ok ? 201 : 400)
  })

  app.get('/api/agents', async (c) => {
    const agents = await factory.listAgents()
    return c.json(agents)
  })

  app.get('/api/agents/:id', async (c) => {
    const agent = await factory.getAgent(c.req.param('id') as AgentId)
    if (!agent) return c.json({ error: 'Not found' }, 404)
    return c.json(agent)
  })

  app.delete('/api/agents/:id', async (c) => {
    const { reason } = await c.req.json<{ reason: string }>()
    const result = await factory.terminateAgent(c.req.param('id') as AgentId, reason)
    return c.json(result)
  })

  // Governor — budget ops
  app.get('/api/budget/:agentId', async (c) => {
    const usage = governor.getUsage(c.req.param('agentId') as AgentId)
    return c.json(usage)
  })

  app.post('/api/budget/:agentId/check', async (c) => {
    const result = governor.checkBudget(c.req.param('agentId') as AgentId)
    return c.json(result)
  })

  // Mechanic — business provisioning
  app.post('/api/businesses', async (c) => {
    const request = await c.req.json()
    const result = await mechanic.provisionBusinessUnit(request)
    return c.json(result, 201)
  })

  app.get('/api/businesses/:id', async (c) => {
    const biz = await mechanic.getBusinessUnit(c.req.param('id') as BusinessId)
    if (!biz) return c.json({ error: 'Not found' }, 404)
    return c.json(biz)
  })

  // Metrics
  app.get('/metrics', async (c) => {
    const agents = await factory.listAgents()
    return c.json({
      agents: { total: agents.length },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    })
  })

  // Librarian — knowledge ops
  app.post('/api/knowledge', async (c) => {
    const entry = await c.req.json()
    const result = await librarian.ingest(entry)
    return c.json(result, result.accepted ? 201 : 409)
  })

  app.post('/api/knowledge/query', async (c) => {
    const { query, filters } = await c.req.json()
    const results = await librarian.query(query, filters)
    return c.json(results)
  })
}
