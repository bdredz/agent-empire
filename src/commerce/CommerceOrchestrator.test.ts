import { describe, expect, it } from 'vitest'
import {
  AgentId,
  CommerceQuote,
  CommerceRail,
  MandateId,
  createAgentId,
} from '@shared/types'
import { AgentIdentityService } from '../trust/AgentIdentityService'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry'
import { MandateService } from '../trust/MandateService'
import { TrustAuditLog } from '../trust/TrustAuditLog'
import { VerificationPolicyEngine } from '../trust/VerificationPolicyEngine'
import { CommerceOrchestrator } from './CommerceOrchestrator'
import { ICommerceRailAdapter } from './ICommerceRailAdapter'
import { QuoteService } from './QuoteService'
import { ReceiptService } from './ReceiptService'
import { RefundPolicyEngine } from './RefundPolicyEngine'
import { SettlementReconciler } from './SettlementReconciler'

class StubAdapter implements ICommerceRailAdapter {
  public readonly rail: CommerceRail

  constructor(
    rail: CommerceRail,
    private readonly settlementById: Record<string, string> = {},
  ) {
    this.rail = rail
  }

  public async authorize(quote: CommerceQuote) {
    return {
      externalId: `${this.rail}_${quote.quoteId}`,
      status: 'authorized' as const,
    }
  }

  public async capture(externalId: string) {
    return {
      externalTransactionId: `txn_${externalId}`,
      status: 'settled' as const,
    }
  }

  public async refund() {
    return { status: 'refunded' as const }
  }

  public async getSettlementStatus(externalTransactionId: string) {
    return {
      status: this.settlementById[externalTransactionId] ?? 'settled',
      settledAt: '2026-03-10T00:00:00.000Z',
    }
  }
}

interface Fixture {
  orchestrator: CommerceOrchestrator
  identityService: AgentIdentityService
  mandateService: MandateService
  counterpartyRegistry: CounterpartyRegistry
  trustAuditLog: TrustAuditLog
  nowIso: { value: string }
}

function createFixture(options: { selectRail?: (quote: CommerceQuote) => CommerceRail } = {}): Fixture {
  const trustAuditLog = new TrustAuditLog()
  const identityService = new AgentIdentityService(trustAuditLog)
  const mandateService = new MandateService(trustAuditLog)
  const verificationPolicyEngine = new VerificationPolicyEngine(identityService, mandateService)
  const counterpartyRegistry = new CounterpartyRegistry()
  const nowIso = { value: '2026-03-10T12:00:00.000Z' }

  const quoteService = new QuoteService(counterpartyRegistry, {
    now: () => new Date(nowIso.value),
  })
  const receiptService = new ReceiptService()
  const refundPolicyEngine = new RefundPolicyEngine({
    now: () => new Date(nowIso.value),
  })

  const railAdapters = new Map<CommerceRail, ICommerceRailAdapter>([
    ['stripe', new StubAdapter('stripe')],
    ['x402', new StubAdapter('x402')],
  ])

  const settlementReconciler = new SettlementReconciler(receiptService, railAdapters)
  const orchestrator = new CommerceOrchestrator(
    quoteService,
    receiptService,
    refundPolicyEngine,
    settlementReconciler,
    mandateService,
    verificationPolicyEngine,
    trustAuditLog,
    railAdapters,
    {
      now: () => new Date(nowIso.value),
      selectRail: options.selectRail,
    },
  )

  return {
    orchestrator,
    identityService,
    mandateService,
    counterpartyRegistry,
    trustAuditLog,
    nowIso,
  }
}

async function createVerifiedAgentWithMandate(fixture: Fixture): Promise<{
  agentId: AgentId
  mandateId: MandateId
}> {
  const identity = await fixture.identityService.issue({
    tenantId: 'tenant-1',
    ownerType: 'user',
    ownerId: 'owner-1',
    role: 'worker',
  })

  await fixture.identityService.verify(identity.agentId)

  const mandate = await fixture.mandateService.create({
    tenantId: 'tenant-1',
    principalId: 'principal-1',
    delegatedAgentId: identity.agentId,
    purpose: 'pay vendors',
    scope: ['payment'],
    maxAmount: 500,
    expiresAt: '2026-12-31T00:00:00.000Z',
  })

  return { agentId: identity.agentId, mandateId: mandate.mandateId }
}

async function addCounterparty(
  fixture: Fixture,
  trustStatus: 'trusted' | 'watch' | 'blocked' | 'unknown' = 'trusted',
) {
  return fixture.counterpartyRegistry.add('tenant-1', {
    displayName: 'Vendor A',
    counterpartyType: 'merchant',
    trustStatus,
    tags: ['vendor'],
  })
}

describe('CommerceOrchestrator', () => {
  it('runs full quote -> authorize -> capture -> receipt flow', async () => {
    const fixture = createFixture()
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const authorization = await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    const receipt = await fixture.orchestrator.capture(authorization.authorizationId)

    expect(authorization.status).toBe('authorized')
    expect(receipt.status).toBe('settled')
  })

  it('rejects authorization when mandate validation fails', async () => {
    const fixture = createFixture()
    const counterparty = await addCounterparty(fixture)
    const { agentId } = await createVerifiedAgentWithMandate(fixture)

    const smallMandate = await fixture.mandateService.create({
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      delegatedAgentId: agentId,
      purpose: 'tiny spend',
      scope: ['payment'],
      maxAmount: 10,
      expiresAt: '2026-12-31T00:00:00.000Z',
    })

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 30, currency: 'USD', quantity: 1 }],
      totalAmount: 30,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    await expect(
      fixture.orchestrator.authorize(quote.quoteId, agentId, smallMandate.mandateId),
    ).rejects.toThrow('Mandate invalid')
  })

  it('enforces trust level for payment actions', async () => {
    const fixture = createFixture()
    const counterparty = await addCounterparty(fixture)

    const unverified = await fixture.identityService.issue({
      tenantId: 'tenant-1',
      ownerType: 'user',
      ownerId: 'owner-2',
      role: 'worker',
    })

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 20, currency: 'USD', quantity: 1 }],
      totalAmount: 20,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    await expect(
      fixture.orchestrator.authorize(quote.quoteId, unverified.agentId),
    ).rejects.toThrow('Payment action denied')
  })

  it('runs refund flow for settled receipts', async () => {
    const fixture = createFixture()
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 40, currency: 'USD', quantity: 1 }],
      totalAmount: 40,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const authorization = await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    const receipt = await fixture.orchestrator.capture(authorization.authorizationId)
    const refunded = await fixture.orchestrator.refund(receipt.receiptId)

    expect(refunded.status).toBe('refunded')
  })

  it('runs credit flow by issuing credit receipt', async () => {
    const fixture = createFixture()
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 90, currency: 'USD', quantity: 1 }],
      totalAmount: 90,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const authorization = await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    const receipt = await fixture.orchestrator.capture(authorization.authorizationId)
    const creditReceipt = await fixture.orchestrator.issueCredit(receipt.receiptId, 20)

    expect(creditReceipt.status).toBe('credited')
    expect(creditReceipt.amount).toBe(20)
  })

  it('delegates reconcile to settlement reconciler', async () => {
    const fixture = createFixture()
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const authorization = await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    await fixture.orchestrator.capture(authorization.authorizationId)

    const report = await fixture.orchestrator.reconcile('tenant-1')
    expect(report).toEqual({ matched: 1, unmatched: 0, issues: [] })
  })

  it('rejects blocked counterparty during quote creation', async () => {
    const fixture = createFixture()
    const blocked = await addCounterparty(fixture, 'blocked')

    await expect(
      fixture.orchestrator.createQuote({
        tenantId: 'tenant-1',
        counterpartyId: blocked.counterpartyId,
        lineItems: [{ description: 'Task', amount: 50, currency: 'USD', quantity: 1 }],
        totalAmount: 50,
        currency: 'USD',
        expiresAt: '2026-03-10T13:00:00.000Z',
      }),
    ).rejects.toThrow('Counterparty is blocked')
  })

  it('rejects expired quote on authorization', async () => {
    const fixture = createFixture()
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T12:01:00.000Z',
    })

    fixture.nowIso.value = '2026-03-10T12:02:00.000Z'

    await expect(
      fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId),
    ).rejects.toThrow('Quote has expired')
  })

  it('routes across multiple rails based on selector', async () => {
    const fixture = createFixture({
      selectRail: (quote) => (quote.totalAmount > 100 ? 'x402' : 'stripe'),
    })
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const smallQuote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 40, currency: 'USD', quantity: 1 }],
      totalAmount: 40,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })
    const largeQuote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 200, currency: 'USD', quantity: 1 }],
      totalAmount: 200,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const smallAuth = await fixture.orchestrator.authorize(smallQuote.quoteId, agentId, mandateId)
    const largeAuth = await fixture.orchestrator.authorize(largeQuote.quoteId, agentId, mandateId)

    expect(smallAuth.rail).toBe('stripe')
    expect(largeAuth.rail).toBe('x402')
  })

  it('writes trust audit entries during authorization flow', async () => {
    const fixture = createFixture()
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 30, currency: 'USD', quantity: 1 }],
      totalAmount: 30,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)

    const entries = await fixture.trustAuditLog.query({ eventType: 'verification_override' })
    expect(entries.length).toBeGreaterThan(0)
  })
})
