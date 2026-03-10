import { describe, it, expect, beforeEach } from 'vitest'
import {
  AgentId,
  CommerceQuote,
  CommerceRail,
  MandateId,
  createAgentId,
  createCounterpartyId,
  createQuoteId,
} from '@shared/types.js'
import { AgentIdentityService } from '../trust/AgentIdentityService.js'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry.js'
import { MandateService } from '../trust/MandateService.js'
import { TrustAuditLog } from '../trust/TrustAuditLog.js'
import { VerificationPolicyEngine } from '../trust/VerificationPolicyEngine.js'
import { CommerceOrchestrator } from '../commerce/CommerceOrchestrator.js'
import { DisputeService } from '../commerce/DisputeService.js'
import { ICommerceRailAdapter } from '../commerce/ICommerceRailAdapter.js'
import { QuoteService } from '../commerce/QuoteService.js'
import { ReceiptService } from '../commerce/ReceiptService.js'
import { RefundPolicyEngine } from '../commerce/RefundPolicyEngine.js'
import { SettlementReconciler } from '../commerce/SettlementReconciler.js'

// ---------------------------------------------------------------------------
// Stub rail adapter — deterministic, no network
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

interface Fixture {
  orchestrator: CommerceOrchestrator
  quoteService: QuoteService
  receiptService: ReceiptService
  refundPolicyEngine: RefundPolicyEngine
  settlementReconciler: SettlementReconciler
  disputeService: DisputeService
  identityService: AgentIdentityService
  mandateService: MandateService
  counterpartyRegistry: CounterpartyRegistry
  trustAuditLog: TrustAuditLog
  railAdapters: Map<CommerceRail, ICommerceRailAdapter>
  nowIso: { value: string }
}

function createFixture(
  options: { selectRail?: (quote: CommerceQuote) => CommerceRail } = {},
): Fixture {
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
  const disputeService = new DisputeService(receiptService)

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
    quoteService,
    receiptService,
    refundPolicyEngine,
    settlementReconciler,
    disputeService,
    identityService,
    mandateService,
    counterpartyRegistry,
    trustAuditLog,
    railAdapters,
    nowIso,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createVerifiedAgentWithMandate(
  fixture: Fixture,
  maxAmount = 500,
): Promise<{ agentId: AgentId; mandateId: MandateId }> {
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
    maxAmount,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Commerce Plane — end-to-end integration', () => {
  let fixture: Fixture

  beforeEach(() => {
    fixture = createFixture()
  })

  // -------------------------------------------------------------------------
  // Test 1: Quote creation with line items and expiry
  // -------------------------------------------------------------------------

  it('creates a quote with correct line items, total, and expiry', async () => {
    const counterparty = await addCounterparty(fixture)

    const quote = await fixture.quoteService.create({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [
        { description: 'Design work', amount: 75, currency: 'USD', quantity: 2 },
        { description: 'Hosting', amount: 50, currency: 'USD', quantity: 1 },
      ],
      totalAmount: 200,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    expect((quote.quoteId as string).startsWith('quote_')).toBe(true)
    expect(quote.totalAmount).toBe(200)
    expect(quote.lineItems).toHaveLength(2)
    expect(quote.lineItems[0]?.description).toBe('Design work')
    expect(quote.lineItems[1]?.description).toBe('Hosting')
    expect(quote.expiresAt).toBe('2026-03-10T13:00:00.000Z')
    expect(quote.createdAt).toBe('2026-03-10T12:00:00.000Z')
    expect(quote.currency).toBe('USD')

    // Quote must be retrievable
    const loaded = await fixture.quoteService.get('tenant-1', quote.quoteId)
    expect(loaded).not.toBeNull()
    expect(loaded?.quoteId).toBe(quote.quoteId)
  })

  // -------------------------------------------------------------------------
  // Test 2: Full quote -> authorize -> capture flow (happy path)
  // -------------------------------------------------------------------------

  it('runs full quote → authorize → capture lifecycle and lands on settled status', async () => {
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 100, currency: 'USD', quantity: 1 }],
      totalAmount: 100,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const authorization = await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    expect(authorization.status).toBe('authorized')
    expect(authorization.quoteId).toBe(quote.quoteId)
    expect(authorization.agentId).toBe(agentId)
    expect(authorization.mandateId).toBe(mandateId)
    expect(authorization.rail).toBe('stripe')
    expect(authorization.amount).toBe(100)

    const receipt = await fixture.orchestrator.capture(authorization.authorizationId)
    expect(receipt.status).toBe('settled')
    expect(receipt.tenantId).toBe('tenant-1')
    expect(receipt.amount).toBe(100)
    expect(receipt.currency).toBe('USD')
    expect(typeof receipt.externalTransactionId).toBe('string')
    expect((receipt.externalTransactionId as string).length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Test 3: Mandate validation — commerce without valid mandate is rejected
  // -------------------------------------------------------------------------

  it('rejects authorization when mandate amount ceiling is exceeded', async () => {
    const counterparty = await addCounterparty(fixture)
    const { agentId } = await createVerifiedAgentWithMandate(fixture, 500)

    // Issue a second mandate with a low ceiling
    const smallMandate = await fixture.mandateService.create({
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      delegatedAgentId: agentId,
      purpose: 'small spend only',
      scope: ['payment'],
      maxAmount: 10,
      expiresAt: '2026-12-31T00:00:00.000Z',
    })

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    // The quote total (50) exceeds the mandate ceiling (10)
    await expect(
      fixture.orchestrator.authorize(quote.quoteId, agentId, smallMandate.mandateId),
    ).rejects.toThrow('Mandate invalid')
  })

  // -------------------------------------------------------------------------
  // Test 4: Trust level gate — unverified agent cannot authorize
  // -------------------------------------------------------------------------

  it('rejects authorization for an unverified agent regardless of mandate', async () => {
    const counterparty = await addCounterparty(fixture)

    // Issue identity but deliberately skip the verify() call
    const unverified = await fixture.identityService.issue({
      tenantId: 'tenant-1',
      ownerType: 'user',
      ownerId: 'owner-unverified',
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

  // -------------------------------------------------------------------------
  // Test 5: Refund policy — auto-refund vs manual review thresholds
  // -------------------------------------------------------------------------

  it('issues auto-refund for low-amount settled receipt', async () => {
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    // Amount < 100 (lowAmountThreshold) → auto_refund path
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
    expect(receipt.status).toBe('settled')

    // Refund should be approved automatically
    const refunded = await fixture.orchestrator.refund(receipt.receiptId)
    expect(refunded.status).toBe('refunded')
  })

  it('raises manual review error for high-amount refund request', async () => {
    // Use a custom fixture where reputation is below medium threshold
    // to trigger manual review for a high-amount transaction
    const highRiskFixture = createFixture()
    const counterparty = await addCounterparty(highRiskFixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(highRiskFixture, 2000)

    // Amount > 1000 (highAmountThreshold) → manual_review path
    const quote = await highRiskFixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Enterprise plan', amount: 1500, currency: 'USD', quantity: 1 }],
      totalAmount: 1500,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const authorization = await highRiskFixture.orchestrator.authorize(
      quote.quoteId,
      agentId,
      mandateId,
    )
    const receipt = await highRiskFixture.orchestrator.capture(authorization.authorizationId)
    expect(receipt.status).toBe('settled')

    // High amount refund → manual review required
    await expect(highRiskFixture.orchestrator.refund(receipt.receiptId)).rejects.toThrow(
      'Refund requires manual review',
    )
  })

  it('evaluates refund policy decisions directly via RefundPolicyEngine', () => {
    const engine = new RefundPolicyEngine({
      now: () => new Date('2026-03-10T12:00:00.000Z'),
    })

    // Low risk: amount < 100, recent purchase, high reputation, no disputes
    const lowRisk = engine.evaluate({
      amount: 50,
      purchaseTimestamp: '2026-03-09T12:00:00.000Z',
      reputationScore: 90,
      disputeCount: 0,
    })
    expect(lowRisk.decision).toBe('auto_refund')

    // High risk: amount > 1000
    const highRisk = engine.evaluate({
      amount: 1500,
      purchaseTimestamp: '2026-03-09T12:00:00.000Z',
      reputationScore: 90,
      disputeCount: 0,
    })
    expect(highRisk.decision).toBe('manual_review')
  })

  // -------------------------------------------------------------------------
  // Test 6: Receipt tracking — verify receipt created with correct details
  // -------------------------------------------------------------------------

  it('creates receipt with correct counterparty, agent, amount, and rail after capture', async () => {
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Service fee', amount: 75, currency: 'USD', quantity: 1 }],
      totalAmount: 75,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const authorization = await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    const receipt = await fixture.orchestrator.capture(authorization.authorizationId)

    // Verify identity fields
    expect(receipt.tenantId).toBe('tenant-1')
    expect(receipt.agentId).toBe(agentId)
    expect(receipt.counterpartyId).toBe(counterparty.counterpartyId)
    expect(receipt.mandateId).toBe(mandateId)
    expect(receipt.quoteId).toBe(quote.quoteId)

    // Verify financial fields
    expect(receipt.amount).toBe(75)
    expect(receipt.currency).toBe('USD')
    expect(receipt.rail).toBe('stripe')
    expect(receipt.status).toBe('settled')

    // Receipt must be fetchable directly from receipt service
    const fetched = await fixture.receiptService.get('tenant-1', receipt.receiptId)
    expect(fetched).not.toBeNull()
    expect(fetched?.receiptId).toBe(receipt.receiptId)
    expect(fetched?.status).toBe('settled')

    // Receipt must appear in tenant listing
    const list = await fixture.receiptService.listByTenant('tenant-1')
    expect(list.some((r) => r.receiptId === receipt.receiptId)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test 7: Settlement reconciliation — receipts match rail status
  // -------------------------------------------------------------------------

  it('reconciles two settled receipts with zero issues', async () => {
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    // Create first receipt
    const quoteA = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task A', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })
    const authA = await fixture.orchestrator.authorize(quoteA.quoteId, agentId, mandateId)
    await fixture.orchestrator.capture(authA.authorizationId)

    // Issue a fresh mandate for the second transaction (mandate is consumed)
    const identity2 = await fixture.identityService.issue({
      tenantId: 'tenant-1',
      ownerType: 'user',
      ownerId: 'owner-2',
      role: 'worker',
    })
    await fixture.identityService.verify(identity2.agentId)
    const mandate2 = await fixture.mandateService.create({
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      delegatedAgentId: identity2.agentId,
      purpose: 'pay vendors',
      scope: ['payment'],
      maxAmount: 500,
      expiresAt: '2026-12-31T00:00:00.000Z',
    })

    // Create second receipt
    const quoteB = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task B', amount: 80, currency: 'USD', quantity: 1 }],
      totalAmount: 80,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })
    const authB = await fixture.orchestrator.authorize(
      quoteB.quoteId,
      identity2.agentId,
      mandate2.mandateId,
    )
    await fixture.orchestrator.capture(authB.authorizationId)

    // Reconcile through orchestrator — stub adapter returns 'settled' for all
    const report = await fixture.orchestrator.reconcile('tenant-1')
    expect(report.matched).toBe(2)
    expect(report.unmatched).toBe(0)
    expect(report.issues).toHaveLength(0)
  })

  it('detects settlement mismatch when rail adapter reports different status', async () => {
    // Use a custom reconciler with a mismatching adapter
    const receiptService = new ReceiptService()
    const mismatchAdapter = new StubAdapter('stripe', { 'txn_known': 'amount_mismatch' })
    const adapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', mismatchAdapter],
    ])
    const reconciler = new SettlementReconciler(receiptService, adapters)

    // Create a receipt that is settled but the adapter reports mismatch
    const receipt = await receiptService.create({
      tenantId: 'tenant-1',
      agentId: createAgentId('agent-mismatch'),
      counterpartyId: createCounterpartyId('counterparty-mismatch'),
      rail: 'stripe',
      externalTransactionId: 'txn_known',
      quoteId: createQuoteId('quote-mismatch'),
      amount: 300,
      currency: 'USD',
    })
    await receiptService.updateStatus('tenant-1', receipt.receiptId, 'settled')

    const report = await reconciler.reconcile('tenant-1')
    expect(report.unmatched).toBe(1)
    expect(report.issues[0]).toContain('Amount mismatch')
  })

  // -------------------------------------------------------------------------
  // Test 8: Dispute flow — file and resolve
  // -------------------------------------------------------------------------

  it('opens dispute on a receipt and resolves it for buyer', async () => {
    const counterparty = await addCounterparty(fixture)
    const { agentId, mandateId } = await createVerifiedAgentWithMandate(fixture)

    const quote = await fixture.orchestrator.createQuote({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Service', amount: 60, currency: 'USD', quantity: 1 }],
      totalAmount: 60,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    const authorization = await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    const receipt = await fixture.orchestrator.capture(authorization.authorizationId)
    expect(receipt.status).toBe('settled')

    // File a dispute against the settled receipt
    const dispute = await fixture.disputeService.open(
      'tenant-1',
      receipt.receiptId,
      'Service not delivered as described',
    )
    expect(dispute.disputeId).toBeDefined()
    expect(dispute.status).toBe('opened')
    expect(dispute.receiptId).toBe(receipt.receiptId)
    expect(dispute.counterpartyId).toBe(counterparty.counterpartyId)
    expect(dispute.reason).toBe('Service not delivered as described')

    // Attach evidence
    const withEvidence = await fixture.disputeService.attachEvidence(
      'tenant-1',
      dispute.disputeId,
      { description: 'Screenshot of conversation', referenceId: 'ref-screenshot-001' },
    )
    expect(withEvidence.evidence).toHaveLength(1)
    expect(withEvidence.evidence[0]?.referenceId).toBe('ref-screenshot-001')

    // Move to review
    const underReview = await fixture.disputeService.updateStatus(
      'tenant-1',
      dispute.disputeId,
      'under_review',
    )
    expect(underReview.status).toBe('under_review')

    // Resolve in buyer's favour
    const resolved = await fixture.disputeService.updateStatus(
      'tenant-1',
      dispute.disputeId,
      'resolved_for_buyer',
    )
    expect(resolved.status).toBe('resolved_for_buyer')

    // Verify dispute is retrievable with final state
    const fetched = await fixture.disputeService.get('tenant-1', dispute.disputeId)
    expect(fetched).not.toBeNull()
    expect(fetched?.status).toBe('resolved_for_buyer')
  })

  it('prevents disputing a refunded receipt', async () => {
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

    // Refund it first
    await fixture.orchestrator.refund(receipt.receiptId)

    // Now try to dispute — should be rejected
    await expect(
      fixture.disputeService.open('tenant-1', receipt.receiptId, 'late complaint'),
    ).rejects.toThrow('Cannot dispute a refunded receipt')
  })
})
