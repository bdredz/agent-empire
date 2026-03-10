import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { AgentId, EventType, Mandate, SystemEvent } from '@shared/types'
import { AgentIdentityService } from './AgentIdentityService'
import { CounterpartyRegistry } from './CounterpartyRegistry'
import { MandateService } from './MandateService'
import { RevocationService } from './RevocationService'
import { TrustAuditLog } from './TrustAuditLog'

interface RevocationFixture {
  auditLog: TrustAuditLog
  identityService: AgentIdentityService
  mandateService: MandateService
  counterpartyRegistry: CounterpartyRegistry
  revocationService: RevocationService
  events: SystemEvent[]
}

function setup(defaultTenantId = 'tenant-1'): RevocationFixture {
  const auditLog = new TrustAuditLog()
  const identityService = new AgentIdentityService(auditLog)
  const mandateService = new MandateService(auditLog)
  const counterpartyRegistry = new CounterpartyRegistry()
  const emitter = new EventEmitter()
  const events: SystemEvent[] = []

  emitter.on(EventType.CircuitBreakerTripped, (event: SystemEvent) => {
    events.push(event)
  })

  const revocationService = new RevocationService(
    identityService,
    mandateService,
    counterpartyRegistry,
    auditLog,
    emitter,
    {
      defaultTenantId,
      now: () => new Date('2026-03-10T00:00:00.000Z'),
      createEventId: (() => {
        let index = 0
        return () => `event-${++index}`
      })(),
    },
  )

  return {
    auditLog,
    identityService,
    mandateService,
    counterpartyRegistry,
    revocationService,
    events,
  }
}

async function issueAgent(
  fixture: RevocationFixture,
  ownerId = 'owner-1',
): Promise<AgentId> {
  const created = await fixture.identityService.issue({
    tenantId: 'tenant-1',
    ownerType: 'user',
    ownerId,
    role: 'worker',
  })

  return created.agentId
}

async function createMandate(
  fixture: RevocationFixture,
  delegatedAgentId: AgentId,
): Promise<Mandate> {
  return fixture.mandateService.create({
    tenantId: 'tenant-1',
    principalId: 'principal-1',
    delegatedAgentId,
    purpose: 'ops',
    scope: ['payment'],
    maxAmount: 100,
    currency: 'USD',
    expiresAt: '2026-12-31T00:00:00.000Z',
  })
}

describe('RevocationService', () => {
  it('revokeAgent cascades active mandate revocations', async () => {
    const fixture = setup()
    const agentId = await issueAgent(fixture)

    const activeOne = await createMandate(fixture, agentId)
    const activeTwo = await createMandate(fixture, agentId)
    const consumed = await createMandate(fixture, agentId)
    await fixture.mandateService.consume(consumed.mandateId)

    const summary = await fixture.revocationService.revokeAgent(agentId)

    expect(summary).toEqual({
      agentRevoked: true,
      mandatesRevoked: 2,
      walletsFrozen: 0,
    })

    const revokedOne = await fixture.mandateService.get(activeOne.mandateId)
    const revokedTwo = await fixture.mandateService.get(activeTwo.mandateId)
    const consumedAfter = await fixture.mandateService.get(consumed.mandateId)

    expect(revokedOne?.status).toBe('revoked')
    expect(revokedTwo?.status).toBe('revoked')
    expect(consumedAfter?.status).toBe('consumed')
  })

  it('revokeAgent freezes all bound wallets', async () => {
    const fixture = setup()
    const agentId = await issueAgent(fixture)
    await fixture.identityService.bindWallet(agentId, 'wallet-a')
    await fixture.identityService.bindWallet(agentId, 'wallet-b')

    const summary = await fixture.revocationService.revokeAgent(agentId)

    expect(summary.walletsFrozen).toBe(2)
    expect(fixture.revocationService.isWalletFrozen('wallet-a')).toBe(true)
    expect(fixture.revocationService.isWalletFrozen('wallet-b')).toBe(true)
  })

  it('revokeMandate revokes a single mandate', async () => {
    const fixture = setup()
    const agentId = await issueAgent(fixture)
    const mandate = await createMandate(fixture, agentId)

    await fixture.revocationService.revokeMandate(mandate.mandateId)
    const validation = await fixture.mandateService.validate(mandate.mandateId, {
      amount: 10,
    })

    expect(validation).toEqual({ valid: false, reason: 'revoked' })
  })

  it('freezeWallet is idempotent', async () => {
    const fixture = setup()

    const first = await fixture.revocationService.freezeWallet('wallet-z')
    const second = await fixture.revocationService.freezeWallet('wallet-z')

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(fixture.revocationService.isWalletFrozen('wallet-z')).toBe(true)
  })

  it('revokeCounterparty blocks counterparties from any mutable trust status', async () => {
    const fixture = setup()
    const counterparty = await fixture.counterpartyRegistry.add('tenant-1', {
      displayName: 'Vendor A',
      counterpartyType: 'merchant',
      trustStatus: 'trusted',
      tags: ['vendor'],
    })

    const blocked = await fixture.revocationService.revokeCounterparty(
      counterparty.counterpartyId,
      'tenant-1',
    )

    expect(blocked.trustStatus).toBe('blocked')
  })

  it('writes trust audit entries for revocation actions', async () => {
    const fixture = setup()
    const agentId = await issueAgent(fixture)
    const mandate = await createMandate(fixture, agentId)

    await fixture.revocationService.revokeMandate(mandate.mandateId)
    await fixture.revocationService.freezeWallet('wallet-a')

    const revokeEntries = await fixture.auditLog.query({
      eventType: 'mandate_revoked',
    })
    const frozenEntries = await fixture.auditLog.query({
      eventType: 'wallet_frozen',
    })

    expect(revokeEntries.length).toBeGreaterThan(0)
    expect(frozenEntries.length).toBeGreaterThan(0)
  })

  it('emits system events for dashboard alerting', async () => {
    const fixture = setup()
    const agentId = await issueAgent(fixture)

    await fixture.revocationService.revokeAgent(agentId, 'security_incident')

    expect(fixture.events.length).toBeGreaterThan(0)
    expect(fixture.events[0]?.eventType).toBe(EventType.CircuitBreakerTripped)
    expect(fixture.events[0]?.payload).toMatchObject({
      tenantId: 'tenant-1',
      targetType: 'agent',
      targetId: agentId,
    })
  })

  it('revokeAgent is idempotent when identity is already revoked', async () => {
    const fixture = setup()
    const agentId = await issueAgent(fixture)
    await fixture.identityService.revoke(agentId, 'prior_incident')

    const summary = await fixture.revocationService.revokeAgent(agentId)

    expect(summary).toEqual({
      agentRevoked: false,
      mandatesRevoked: 0,
      walletsFrozen: 0,
    })
    expect(fixture.events).toHaveLength(0)
  })
})
