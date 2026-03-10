import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AgentGradeApiGateway } from './AgentGradeApiGateway'
import { GatewayMiddleware } from './GatewayTypes'

const passthroughMiddleware: GatewayMiddleware = async (_context, next) => next()

const createGateway = (
  overrides: Partial<{
    trustMiddleware: GatewayMiddleware
    rateLimitMiddleware: GatewayMiddleware
    paymentChallengeMiddleware: GatewayMiddleware
  }> = {},
) =>
  new AgentGradeApiGateway({
    trustMiddleware: overrides.trustMiddleware ?? passthroughMiddleware,
    rateLimitMiddleware: overrides.rateLimitMiddleware ?? passthroughMiddleware,
    paymentChallengeMiddleware:
      overrides.paymentChallengeMiddleware ?? passthroughMiddleware,
    now: () => new Date('2026-03-10T12:00:00.000Z'),
    idFactory: () => '001',
  })

describe('AgentGradeApiGateway', () => {
  it('passes valid requests to route handler', async () => {
    const gateway = createGateway()
    gateway.registerRoute({
      method: 'POST',
      path: '/tasks',
      schema: z.object({ task: z.string().min(1) }),
      handler: async () => ({ status: 200, body: { accepted: true }, headers: {} }),
    })

    const response = await gateway.handle({
      method: 'POST',
      path: '/tasks',
      body: { task: 'run test' },
      headers: {},
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ accepted: true })
  })

  it('rejects invalid schema payloads', async () => {
    const gateway = createGateway()
    gateway.registerRoute({
      method: 'POST',
      path: '/tasks',
      schema: z.object({ task: z.string().min(1) }),
      handler: async () => ({ status: 200, body: { accepted: true }, headers: {} }),
    })

    const response = await gateway.handle({
      method: 'POST',
      path: '/tasks',
      body: { task: 123 },
      headers: {},
    })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      error: { code: 'invalid_schema' },
    })
  })

  it('normalizes thrown errors into structured responses', async () => {
    const gateway = createGateway()
    gateway.registerRoute({
      method: 'GET',
      path: '/boom',
      handler: async () => {
        throw new Error('unexpected_failure')
      },
    })

    const response = await gateway.handle({
      method: 'GET',
      path: '/boom',
      headers: {},
    })

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({
      error: { code: 'internal_error', message: 'unexpected_failure' },
    })
  })

  it('executes middleware chain in expected order', async () => {
    const order: string[] = []
    const trust: GatewayMiddleware = async (_context, next) => {
      order.push('trust')
      return next()
    }
    const rate: GatewayMiddleware = async (_context, next) => {
      order.push('rate_limit')
      return next()
    }
    const payment: GatewayMiddleware = async (_context, next) => {
      order.push('payment')
      return next()
    }

    const gateway = createGateway({
      trustMiddleware: trust,
      rateLimitMiddleware: rate,
      paymentChallengeMiddleware: payment,
    })

    gateway.registerRoute({
      method: 'GET',
      path: '/ordered',
      handler: async () => {
        order.push('handler')
        return { status: 200, body: { ok: true }, headers: {} }
      },
    })

    const response = await gateway.handle({
      method: 'GET',
      path: '/ordered',
      headers: {},
    })

    expect(response.status).toBe(200)
    expect(order).toEqual(['trust', 'rate_limit', 'payment', 'handler'])
  })

  it('returns 404 for unknown routes', async () => {
    const gateway = createGateway()
    const response = await gateway.handle({
      method: 'GET',
      path: '/missing',
      headers: {},
    })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      error: { code: 'route_not_found' },
    })
  })

  it('captures request logs', async () => {
    const gateway = createGateway()
    gateway.registerRoute({
      method: 'GET',
      path: '/logs',
      handler: async () => ({ status: 200, body: { ok: true }, headers: {} }),
    })
    await gateway.handle({ method: 'GET', path: '/logs', headers: {} })
    const logs = gateway.getLogs()

    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ method: 'GET', path: '/logs', status: 200 })
  })

  it('returns structured error format with request id', async () => {
    const gateway = createGateway()
    const response = await gateway.handle({ method: 'GET', path: '/missing', headers: {} })

    expect(response.body).toMatchObject({
      error: {
        code: 'route_not_found',
        message: 'Route not found',
      },
      requestId: 'gateway_req_001',
    })
  })

  it('bypasses middleware chain for health checks', async () => {
    let middlewareRuns = 0
    const countingMiddleware: GatewayMiddleware = async (_context, next) => {
      middlewareRuns += 1
      return next()
    }

    const gateway = createGateway({
      trustMiddleware: countingMiddleware,
      rateLimitMiddleware: countingMiddleware,
      paymentChallengeMiddleware: countingMiddleware,
    })

    gateway.registerRoute({
      method: 'GET',
      path: '/health',
      isHealthCheck: true,
      handler: async () => ({ status: 200, body: { status: 'ok' }, headers: {} }),
    })

    const response = await gateway.handle({
      method: 'GET',
      path: '/health',
      headers: {},
    })

    expect(response.status).toBe(200)
    expect(middlewareRuns).toBe(0)
  })
})
