import { describe, expect, it } from 'vitest'
import { CounterpartyRateLimiter } from './CounterpartyRateLimiter'
import { GatewayContext } from './GatewayTypes'

const createContext = (
  trustStatus: GatewayContext['state']['trustStatus'],
  counterpartyId = 'counterparty-1',
): GatewayContext => ({
  request: {
    method: 'POST',
    path: '/paid',
    headers: {},
  },
  route: {
    method: 'POST',
    path: '/paid',
    handler: async () => ({ status: 200, body: { ok: true }, headers: {} }),
  },
  state: {
    requestId: 'req-1',
    trustStatus,
    counterpartyId,
  },
})

describe('CounterpartyRateLimiter', () => {
  it('allows requests within limit', async () => {
    const limiter = new CounterpartyRateLimiter({
      limits: { unknown: 2 },
      windowMs: 1000,
      nowMs: () => 0,
    })

    const middleware = limiter.createMiddleware()
    const context = createContext('unknown')

    const first = await middleware(context, async () => ({ status: 200, body: {} }))
    const second = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
  })

  it('returns 429 when over limit', async () => {
    const limiter = new CounterpartyRateLimiter({
      limits: { unknown: 1 },
      windowMs: 1000,
      nowMs: () => 0,
    })

    const middleware = limiter.createMiddleware()
    const context = createContext('unknown')

    await middleware(context, async () => ({ status: 200, body: {} }))
    const rejected = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(rejected.status).toBe(429)
    expect(rejected.body).toMatchObject({ error: { code: 'rate_limited' } })
  })

  it('gives trusted counterparties higher limit', () => {
    const limiter = new CounterpartyRateLimiter({
      limits: { trusted: 3, unknown: 1 },
      windowMs: 1000,
      nowMs: () => 0,
    })

    const trustedThird = limiter.check('counterparty-a', 'trusted')
    limiter.check('counterparty-a', 'trusted')
    limiter.check('counterparty-a', 'trusted')
    const trustedFourth = limiter.check('counterparty-a', 'trusted')

    const unknownFirst = limiter.check('counterparty-b', 'unknown')
    const unknownSecond = limiter.check('counterparty-b', 'unknown')

    expect(trustedThird.allowed).toBe(true)
    expect(trustedFourth.allowed).toBe(false)
    expect(unknownFirst.allowed).toBe(true)
    expect(unknownSecond.allowed).toBe(false)
  })

  it('gives watch counterparties lower limit', () => {
    const limiter = new CounterpartyRateLimiter({
      limits: { watch: 1, unknown: 3 },
      windowMs: 1000,
      nowMs: () => 0,
    })

    const first = limiter.check('counterparty-watch', 'watch')
    const second = limiter.check('counterparty-watch', 'watch')

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)
  })

  it('blocks blocked counterparties immediately', async () => {
    const limiter = new CounterpartyRateLimiter({
      limits: { blocked: 0 },
      windowMs: 1000,
      nowMs: () => 0,
    })

    const middleware = limiter.createMiddleware()
    const response = await middleware(createContext('blocked'), async () => ({
      status: 200,
      body: {},
    }))

    expect(response.status).toBe(429)
    expect(response.headers?.['X-RateLimit-Limit']).toBe('0')
  })

  it('sets retry-after header based on reset window', async () => {
    let now = 1000
    const limiter = new CounterpartyRateLimiter({
      limits: { unknown: 1 },
      windowMs: 10_000,
      nowMs: () => now,
    })

    const middleware = limiter.createMiddleware()
    const context = createContext('unknown')

    await middleware(context, async () => ({ status: 200, body: {} }))
    now = 2000
    const rejected = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(rejected.status).toBe(429)
    expect(rejected.headers?.['Retry-After']).toBe('9')
  })
})
