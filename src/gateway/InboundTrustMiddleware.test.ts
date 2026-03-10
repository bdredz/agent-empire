import { describe, expect, it } from 'vitest'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry'
import { TrustAuditLog } from '../trust/TrustAuditLog'
import { InboundTrustMiddleware } from './InboundTrustMiddleware'
import { GatewayContext } from './GatewayTypes'

const baseContext = (
  headers: Record<string, string | undefined> = {},
): GatewayContext => ({
  request: {
    method: 'POST',
    path: '/execute',
    headers,
  },
  route: {
    method: 'POST',
    path: '/execute',
    handler: async () => ({ status: 200, body: { ok: true }, headers: {} }),
  },
  state: {
    requestId: 'req-1',
    trustStatus: 'unknown',
  },
})

describe('InboundTrustMiddleware', () => {
  it('allows trusted agents', async () => {
    const registry = new CounterpartyRegistry()
    const audit = new TrustAuditLog()
    const trusted = await registry.add('tenant-1', {
      displayName: 'Trusted Agent',
      counterpartyType: 'agent_platform',
      trustStatus: 'trusted',
      tags: [],
    })

    const middleware = new InboundTrustMiddleware(registry, audit).createMiddleware()
    const context = baseContext({
      'x-tenant-id': 'tenant-1',
      'x-counterparty-id': trusted.counterpartyId,
    })

    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(200)
    expect(context.state.trustStatus).toBe('trusted')
  })

  it('rejects blocked agents', async () => {
    const registry = new CounterpartyRegistry()
    const audit = new TrustAuditLog()
    const blocked = await registry.add('tenant-1', {
      displayName: 'Blocked Agent',
      counterpartyType: 'agent_platform',
      trustStatus: 'blocked',
      tags: [],
    })

    const middleware = new InboundTrustMiddleware(registry, audit).createMiddleware()
    const context = baseContext({
      'x-tenant-id': 'tenant-1',
      'x-counterparty-id': blocked.counterpartyId,
    })

    await expect(
      middleware(context, async () => ({ status: 200, body: {} })),
    ).rejects.toThrow('Counterparty is blocked')
  })

  it('marks watch agents for stricter downstream handling', async () => {
    const registry = new CounterpartyRegistry()
    const audit = new TrustAuditLog()
    const watch = await registry.add('tenant-1', {
      displayName: 'Watch Agent',
      counterpartyType: 'agent_platform',
      trustStatus: 'watch',
      tags: [],
    })

    const middleware = new InboundTrustMiddleware(registry, audit).createMiddleware()
    const context = baseContext({
      'x-tenant-id': 'tenant-1',
      'x-counterparty-id': watch.counterpartyId,
    })

    await middleware(context, async () => ({ status: 200, body: {} }))

    expect(context.state.trustStatus).toBe('watch')
  })

  it('allows unknown agents by default', async () => {
    const middleware = new InboundTrustMiddleware(
      new CounterpartyRegistry(),
      new TrustAuditLog(),
    ).createMiddleware()

    const context = baseContext({
      'x-tenant-id': 'tenant-1',
      'x-counterparty-id': 'counterparty_unknown',
    })

    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(200)
    expect(context.state.trustStatus).toBe('unknown')
  })

  it('handles missing identity header', async () => {
    const middleware = new InboundTrustMiddleware(
      new CounterpartyRegistry(),
      new TrustAuditLog(),
    ).createMiddleware()

    const context = baseContext({ 'x-tenant-id': 'tenant-1' })
    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(200)
    expect(context.state.counterpartyId).toBeUndefined()
    expect(context.state.trustStatus).toBe('unknown')
  })

  it('suppresses recursive traffic', async () => {
    const middleware = new InboundTrustMiddleware(
      new CounterpartyRegistry(),
      new TrustAuditLog(),
      { selfAgentId: 'agent-self' },
    ).createMiddleware()

    const context = baseContext({ 'x-counterparty-id': 'agent-self' })

    await expect(
      middleware(context, async () => ({ status: 200, body: {} })),
    ).rejects.toThrow('Recursive agent traffic suppressed')
  })

  it('writes audit entries for inbound requests', async () => {
    const registry = new CounterpartyRegistry()
    const audit = new TrustAuditLog()
    const trusted = await registry.add('tenant-1', {
      displayName: 'Trusted Agent',
      counterpartyType: 'agent_platform',
      trustStatus: 'trusted',
      tags: [],
    })

    const middleware = new InboundTrustMiddleware(registry, audit).createMiddleware()
    const context = baseContext({
      'x-tenant-id': 'tenant-1',
      'x-counterparty-id': trusted.counterpartyId,
    })

    await middleware(context, async () => ({ status: 200, body: {} }))
    const entries = await audit.query({ tenantId: 'tenant-1' })

    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]?.eventType).toBe('verification_override')
  })

  it('supports multiple identity header formats', async () => {
    const registry = new CounterpartyRegistry()
    const audit = new TrustAuditLog()
    const trusted = await registry.add('tenant-1', {
      displayName: 'Trusted Agent',
      counterpartyType: 'agent_platform',
      trustStatus: 'trusted',
      tags: [],
    })

    const middleware = new InboundTrustMiddleware(registry, audit).createMiddleware()

    const fromAgentIdHeader = baseContext({
      'x-tenant-id': 'tenant-1',
      'x-agent-id': trusted.counterpartyId,
    })
    await middleware(fromAgentIdHeader, async () => ({ status: 200, body: {} }))

    const fromIdentityJson = baseContext({
      'x-tenant-id': 'tenant-1',
      'x-agent-identity': JSON.stringify({ counterpartyId: trusted.counterpartyId }),
    })
    await middleware(fromIdentityJson, async () => ({ status: 200, body: {} }))

    const fromAuthorization = baseContext({
      'x-tenant-id': 'tenant-1',
      authorization: `Agent ${trusted.counterpartyId}`,
    })
    await middleware(fromAuthorization, async () => ({ status: 200, body: {} }))

    expect(fromAgentIdHeader.state.trustStatus).toBe('trusted')
    expect(fromIdentityJson.state.trustStatus).toBe('trusted')
    expect(fromAuthorization.state.trustStatus).toBe('trusted')
  })
})
