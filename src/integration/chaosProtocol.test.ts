import { describe, it, expect, beforeEach } from 'vitest'
import type { AgentId, MandateId, CommerceRail, CommerceQuote } from '@shared/types.js'
import { createWalletPolicyId } from '@shared/types.js'
import { AgentIdentityService } from '../trust/AgentIdentityService.js'
import { MandateService } from '../trust/MandateService.js'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry.js'
import { TrustAuditLog } from '../trust/TrustAuditLog.js'
import { VerificationPolicyEngine } from '../trust/VerificationPolicyEngine.js'
import { RevocationService } from '../trust/RevocationService.js'
import { CommerceOrchestrator } from '../commerce/CommerceOrchestrator.js'
import { QuoteService } from '../commerce/QuoteService.js'
import { ReceiptService } from '../commerce/ReceiptService.js'
import { RefundPolicyEngine } from '../commerce/RefundPolicyEngine.js'
import { SettlementReconciler } from '../commerce/SettlementReconciler.js'
import { DisputeService } from '../commerce/DisputeService.js'
import { ICommerceRailAdapter } from '../commerce/ICommerceRailAdapter.js'
import { WalletPolicyEngine } from '../commerce/wallets/WalletPolicyEngine.js'
import { SourcePolicyEngine } from '../evidence/SourcePolicyEngine.js'
import { EvidenceStore } from '../evidence/EvidenceStore.js'
import { ClaimExtractor } from '../evidence/ClaimExtractor.js'
import { FreshnessScorer } from '../evidence/FreshnessScorer.js'
import { CitationCompiler } from '../evidence/CitationCompiler.js'
import { ResearchReportBuilder } from '../evidence/ResearchReportBuilder.js'
import { ResearchBroker } from '../evidence/ResearchBroker.js'

// ---------------------------------------------------------------------------
// Stub rail adapters
// ---------------------------------------------------------------------------

class StubAdapter implements ICommerceRailAdapter {
  public readonly rail: CommerceRail
  constructor(rail: CommerceRail) { this.rail = rail }
  public async authorize(quote: CommerceQuote) {
    return { externalId: `${this.rail}_${quote.quoteId}`, status: 'authorized' as const }
  }
  public async capture(externalId: string) {
    return { externalTransactionId: `txn_${externalId}`, status: 'settled' as const }
  }
  public async refund() { return { status: 'refunded' as const } }
  public async getSettlementStatus() {
    return { status: 'settled', settledAt: '2026-03-10T00:00:00.000Z' }
  }
}

class FailingAuthorizeAdapter implements ICommerceRailAdapter {
  public readonly rail: CommerceRail
  constructor(rail: CommerceRail) { this.rail = rail }
  public async authorize(): Promise<never> { throw new Error('Rail authorization network failure') }
  public async capture(externalId: string) {
    return { externalTransactionId: `txn_${externalId}`, status: 'settled' as const }
  }
  public async refund() { return { status: 'refunded' as const } }
  public async getSettlementStatus() {
    return { status: 'settled', settledAt: '2026-03-10T00:00:00.000Z' }
  }
}

class FailingCaptureAdapter implements ICommerceRailAdapter {
  public readonly rail: CommerceRail
  constructor(rail: CommerceRail) { this.rail = rail }
  public async authorize(quote: CommerceQuote) {
    return { externalId: `${this.rail}_${quote.quoteId}`, status: 'authorized' as const }
  }
  public async capture(): Promise<never> { throw new Error('Rail capture network failure') }
  public async refund() { return { status: 'refunded' as const } }
  public async getSettlementStatus() {
    return { status: 'settled', settledAt: '2026-03-10T00:00:00.000Z' }
  }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

interface ChaosFixture {
  trustAuditLog: TrustAuditLog
  identityService: AgentIdentityService
  mandateService: MandateService
  counterpartyRegistry: CounterpartyRegistry
  policyEngine: VerificationPolicyEngine
  revocationService: RevocationService
  orchestrator: CommerceOrchestrator
  quoteService: QuoteService
  receiptService: ReceiptService
  refundPolicyEngine: RefundPolicyEngine
  settlementReconciler: SettlementReconciler
  disputeService: DisputeService
  railAdapters: Map<CommerceRail, ICommerceRailAdapter>
  walletPolicyEngine: WalletPolicyEngine
}

function buildChaosFixture(
  overrides: { railAdapters?: Map<CommerceRail, ICommerceRailAdapter> } = {},
): ChaosFixture {
  const nowIso = '2026-03-11T10:00:00.000Z'
  const trustAuditLog = new TrustAuditLog()
  const identityService = new AgentIdentityService(trustAuditLog)
  const mandateService = new MandateService(trustAuditLog)
  const counterpartyRegistry = new CounterpartyRegistry()
  const policyEngine = new VerificationPolicyEngine(identityService, mandateService)
  const revocationService = new RevocationService(
    identityService,
    mandateService,
    counterpartyRegistry,
    trustAuditLog,
    undefined,
    { defaultTenantId: 'tenant-chaos' },
  )

  const quoteService = new QuoteService(counterpartyRegistry, { now: () => new Date(nowIso) })
  const receiptService = new ReceiptService()
  const refundPolicyEngine = new RefundPolicyEngine({ now: () => new Date(nowIso) })

  const railAdapters: Map<CommerceRail, ICommerceRailAdapter> =
    overrides.railAdapters ??
    new Map<CommerceRail, ICommerceRailAdapter>([
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
    policyEngine,
    trustAuditLog,
    railAdapters,
    { now: () => new Date(nowIso) },
  )

  const walletPolicyEngine = new WalletPolicyEngine()

  return {
    trustAuditLog,
    identityService,
    mandateService,
    counterpartyRegistry,
    policyEngine,
    revocationService,
    orchestrator,
    quoteService,
    receiptService,
    refundPolicyEngine,
    settlementReconciler,
    disputeService,
    railAdapters,
    walletPolicyEngine,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function issueVerifiedAgent(
  fixture: ChaosFixture,
  ownerId: string,
  tenantId = 'tenant-chaos',
): Promise<AgentId> {
  const identity = await fixture.identityService.issue({
    tenantId,
    ownerId,
    ownerType: 'user',
    role: 'worker',
  })
  await fixture.identityService.verify(identity.agentId)
  return identity.agentId
}

async function createMandate(
  fixture: ChaosFixture,
  agentId: AgentId,
  maxAmount = 500,
  tenantId = 'tenant-chaos',
): Promise<MandateId> {
  const mandate = await fixture.mandateService.create({
    tenantId,
    principalId: 'principal-chaos',
    delegatedAgentId: agentId,
    purpose: 'chaos test mandate',
    scope: ['payment'],
    maxAmount,
    expiresAt: '2099-12-31T00:00:00.000Z',
  })
  return mandate.mandateId
}

async function addCounterparty(fixture: ChaosFixture, tenantId = 'tenant-chaos') {
  return fixture.counterpartyRegistry.add(tenantId, {
    displayName: 'Chaos Vendor',
    counterpartyType: 'merchant',
    trustStatus: 'trusted',
    tags: ['chaos'],
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chaos Protocol — adversarial and failure scenarios', () => {
  let fixture: ChaosFixture

  beforeEach(() => {
    fixture = buildChaosFixture()
  })

  // -------------------------------------------------------------------------
  // Test 1: Revocation cascade under load
  // -------------------------------------------------------------------------

  it('revokes 5 agents with mandates and wallet bindings — all mandates revoked, all wallets frozen', async () => {
    const tenantId = 'tenant-chaos'
    const agentCount = 5

    // Issue 5 agents, each with 2 mandates and 1 wallet binding
    const agentData: Array<{ agentId: AgentId; mandateIdA: MandateId; mandateIdB: MandateId }> = []

    for (let i = 0; i < agentCount; i++) {
      const agentId = await issueVerifiedAgent(fixture, `chaos-owner-${i}`, tenantId)
      const mandateIdA = await createMandate(fixture, agentId, 500, tenantId)
      const mandateIdB = await createMandate(fixture, agentId, 300, tenantId)
      await fixture.identityService.bindWallet(agentId, `wallet-chaos-${i}`)
      agentData.push({ agentId, mandateIdA, mandateIdB })
    }

    // Revoke all agents in rapid succession
    const summaries = await Promise.all(
      agentData.map(({ agentId }, i) =>
        fixture.revocationService.revokeAgent(agentId, `chaos_incident_${i}`),
      ),
    )

    // Each summary must report correct counts
    for (const summary of summaries) {
      expect(summary.agentRevoked).toBe(true)
      expect(summary.mandatesRevoked).toBe(2)
      expect(summary.walletsFrozen).toBe(1)
    }

    // Verify all mandates are revoked
    for (const { mandateIdA, mandateIdB } of agentData) {
      const resultA = await fixture.mandateService.validate(mandateIdA, { amount: 10 })
      const resultB = await fixture.mandateService.validate(mandateIdB, { amount: 10 })
      expect(resultA.valid).toBe(false)
      expect(resultA.reason).toBe('revoked')
      expect(resultB.valid).toBe(false)
      expect(resultB.reason).toBe('revoked')
    }

    // Verify all wallets are frozen
    for (let i = 0; i < agentCount; i++) {
      expect(fixture.revocationService.isWalletFrozen(`wallet-chaos-${i}`, tenantId)).toBe(true)
    }

    // Verify all identities are revoked
    for (const { agentId } of agentData) {
      const identity = await fixture.identityService.get(agentId)
      expect(identity?.verificationStatus).toBe('revoked')
    }
  })

  // -------------------------------------------------------------------------
  // Test 2: Wallet freeze mid-transaction
  // -------------------------------------------------------------------------

  it('freezes wallet after quote authorization — wallet engine rejects subsequent evaluation', async () => {
    const tenantId = 'tenant-chaos'
    const walletId = 'wallet-freeze-test'

    const counterparty = await addCounterparty(fixture, tenantId)
    const agentId = await issueVerifiedAgent(fixture, 'freeze-owner', tenantId)
    const mandateId = await createMandate(fixture, agentId, 500, tenantId)

    // Create a quote and authorize it
    const quote = await fixture.orchestrator.createQuote({
      tenantId,
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Service', amount: 100, currency: 'USD', quantity: 1 }],
      totalAmount: 100,
      currency: 'USD',
      expiresAt: '2026-03-11T12:00:00.000Z',
    })

    await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)

    // Register a wallet policy so we can evaluate transactions
    fixture.walletPolicyEngine.upsertPolicy({
      walletPolicyId: createWalletPolicyId('policy-freeze-test'),
      tenantId,
      walletId,
      maxPerTransaction: 500,
      allowedAssets: ['USD'],
    })

    // Confirm wallet policy allows transactions BEFORE freeze
    const beforeFreeze = fixture.walletPolicyEngine.evaluate(walletId, { amount: 50, asset: 'USD' })
    expect(beforeFreeze.allowed).toBe(true)

    // Freeze the wallet via RevocationService
    const frozen = await fixture.revocationService.freezeWallet(walletId, tenantId)
    expect(frozen).toBe(true)

    // Confirm RevocationService tracks the freeze
    expect(fixture.revocationService.isWalletFrozen(walletId, tenantId)).toBe(true)

    // Freeze the wallet in the WalletPolicyEngine as well (simulating coordinated freeze)
    fixture.walletPolicyEngine.freeze(walletId)

    // WalletPolicyEngine must now reject transactions for the frozen wallet
    const afterFreeze = fixture.walletPolicyEngine.evaluate(walletId, { amount: 50, asset: 'USD' })
    expect(afterFreeze.allowed).toBe(false)
    expect(afterFreeze.reason).toBe('wallet_frozen')
  })

  // -------------------------------------------------------------------------
  // Test 3: Evidence freshness failure and budget exhaustion
  // -------------------------------------------------------------------------

  it('research with realtime freshness returns a report with freshnessDate and confidence', async () => {
    const sourcePolicyEngine = new SourcePolicyEngine({})
    const evidenceStore = new EvidenceStore()
    const claimExtractor = new ClaimExtractor()
    const freshnessScorer = new FreshnessScorer()
    const citationCompiler = new CitationCompiler()
    const reportBuilder = new ResearchReportBuilder()
    const broker = new ResearchBroker(
      sourcePolicyEngine,
      evidenceStore,
      claimExtractor,
      freshnessScorer,
      citationCompiler,
      reportBuilder,
    )

    const report = await broker.research({
      question: 'What are the latest developments in quantum computing?',
      tenantId: 'tenant-chaos',
      freshnessRequirement: 'realtime',
    })

    // freshnessDate must be present and be a valid ISO timestamp
    expect(typeof report.freshnessDate).toBe('string')
    const parsed = new Date(report.freshnessDate)
    expect(isNaN(parsed.getTime())).toBe(false)

    // confidence is a number between 0 and 1
    expect(report.confidence).toBeGreaterThanOrEqual(0)
    expect(report.confidence).toBeLessThanOrEqual(1)
  })

  it('throws Budget exhausted when budgetTokens is too low', async () => {
    const sourcePolicyEngine = new SourcePolicyEngine({})
    const evidenceStore = new EvidenceStore()
    const claimExtractor = new ClaimExtractor()
    const freshnessScorer = new FreshnessScorer()
    const citationCompiler = new CitationCompiler()
    const reportBuilder = new ResearchReportBuilder()
    const broker = new ResearchBroker(
      sourcePolicyEngine,
      evidenceStore,
      claimExtractor,
      freshnessScorer,
      citationCompiler,
      reportBuilder,
    )

    await expect(
      broker.research({
        question: 'Will this work?',
        tenantId: 'tenant-chaos',
        budgetTokens: 5,
      }),
    ).rejects.toThrow('Budget exhausted')
  })

  // -------------------------------------------------------------------------
  // Test 4: Rail adapter failure propagation
  // -------------------------------------------------------------------------

  it('propagates rail authorization failure — does not silently swallow the error', async () => {
    const failingAdapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', new FailingAuthorizeAdapter('stripe')],
      ['x402', new FailingAuthorizeAdapter('x402')],
    ])
    const failFixture = buildChaosFixture({ railAdapters: failingAdapters })

    const tenantId = 'tenant-chaos'
    const counterparty = await addCounterparty(failFixture, tenantId)
    const agentId = await issueVerifiedAgent(failFixture, 'fail-auth-owner', tenantId)
    const mandateId = await createMandate(failFixture, agentId, 500, tenantId)

    const quote = await failFixture.orchestrator.createQuote({
      tenantId,
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 100, currency: 'USD', quantity: 1 }],
      totalAmount: 100,
      currency: 'USD',
      expiresAt: '2026-03-11T12:00:00.000Z',
    })

    await expect(
      failFixture.orchestrator.authorize(quote.quoteId, agentId, mandateId),
    ).rejects.toThrow('Rail authorization network failure')
  })

  it('propagates rail capture failure — does not silently swallow the error', async () => {
    const failingAdapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', new FailingCaptureAdapter('stripe')],
      ['x402', new FailingCaptureAdapter('x402')],
    ])
    const failFixture = buildChaosFixture({ railAdapters: failingAdapters })

    const tenantId = 'tenant-chaos'
    const counterparty = await addCounterparty(failFixture, tenantId)
    const agentId = await issueVerifiedAgent(failFixture, 'fail-capture-owner', tenantId)
    const mandateId = await createMandate(failFixture, agentId, 500, tenantId)

    const quote = await failFixture.orchestrator.createQuote({
      tenantId,
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 100, currency: 'USD', quantity: 1 }],
      totalAmount: 100,
      currency: 'USD',
      expiresAt: '2026-03-11T12:00:00.000Z',
    })

    // Authorize succeeds (FailingCaptureAdapter.authorize works)
    const authorization = await failFixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    expect(authorization.status).toBe('authorized')

    // Capture must throw
    await expect(
      failFixture.orchestrator.capture(authorization.authorizationId),
    ).rejects.toThrow('Rail capture network failure')
  })

  // -------------------------------------------------------------------------
  // Test 5: Counterparty block mid-flow
  // -------------------------------------------------------------------------

  it('blocks counterparty and verifies blocked->trusted transition throws', async () => {
    const tenantId = 'tenant-chaos'

    // Register counterparty as trusted
    const counterparty = await fixture.counterpartyRegistry.add(tenantId, {
      displayName: 'Adversarial Vendor',
      counterpartyType: 'merchant',
      trustStatus: 'trusted',
      tags: ['adversarial'],
    })
    expect(counterparty.trustStatus).toBe('trusted')

    // Create a quote with this counterparty while it is still trusted
    const agentId = await issueVerifiedAgent(fixture, 'block-flow-owner', tenantId)
    const mandateId = await createMandate(fixture, agentId, 500, tenantId)

    const quote = await fixture.orchestrator.createQuote({
      tenantId,
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Service', amount: 80, currency: 'USD', quantity: 1 }],
      totalAmount: 80,
      currency: 'USD',
      expiresAt: '2026-03-11T12:00:00.000Z',
    })
    expect(quote.counterpartyId).toBe(counterparty.counterpartyId)

    // Block the counterparty (must go through 'watch' first per transition rules)
    await fixture.counterpartyRegistry.updateTrustStatus(
      tenantId,
      counterparty.counterpartyId,
      'watch',
    )
    const blocked = await fixture.counterpartyRegistry.updateTrustStatus(
      tenantId,
      counterparty.counterpartyId,
      'blocked',
    )
    expect(blocked.trustStatus).toBe('blocked')

    // QuoteService gates on blocked status — creating a new quote must throw
    await expect(
      fixture.orchestrator.createQuote({
        tenantId,
        counterpartyId: counterparty.counterpartyId,
        lineItems: [{ description: 'New service', amount: 50, currency: 'USD', quantity: 1 }],
        totalAmount: 50,
        currency: 'USD',
        expiresAt: '2026-03-11T12:00:00.000Z',
      }),
    ).rejects.toThrow('Counterparty is blocked')

    // Verify blocked counterparty cannot transition directly to trusted
    await expect(
      fixture.counterpartyRegistry.updateTrustStatus(
        tenantId,
        counterparty.counterpartyId,
        'trusted',
      ),
    ).rejects.toThrow('Invalid trust status transition: blocked -> trusted')

    // Authorize with the pre-block quote must still work (authorize checks agent+mandate, not counterparty status at auth time)
    const auth = await fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    expect(auth.status).toBe('authorized')
  })

  // -------------------------------------------------------------------------
  // Test 6: Mandate expiry during authorization
  // -------------------------------------------------------------------------

  it('rejects authorization with an expired mandate', async () => {
    const tenantId = 'tenant-chaos'
    const counterparty = await addCounterparty(fixture, tenantId)
    const agentId = await issueVerifiedAgent(fixture, 'expired-mandate-owner', tenantId)

    // Create a mandate with expiresAt in the past
    const expiredMandate = await fixture.mandateService.create({
      tenantId,
      principalId: 'principal-chaos',
      delegatedAgentId: agentId,
      purpose: 'expired mandate',
      scope: ['payment'],
      maxAmount: 500,
      expiresAt: '2020-01-01T00:00:00.000Z',
    })

    // Validate directly — must be expired
    const validationResult = await fixture.mandateService.validate(expiredMandate.mandateId, {
      amount: 100,
    })
    expect(validationResult.valid).toBe(false)
    expect(validationResult.reason).toBe('expired')

    const quote = await fixture.orchestrator.createQuote({
      tenantId,
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 100, currency: 'USD', quantity: 1 }],
      totalAmount: 100,
      currency: 'USD',
      expiresAt: '2026-03-11T12:00:00.000Z',
    })

    // The policy engine validates the mandate first — expired mandate → active_mandate_required
    // which surfaces as 'Payment action denied: active_mandate_required'
    await expect(
      fixture.orchestrator.authorize(quote.quoteId, agentId, expiredMandate.mandateId),
    ).rejects.toThrow('Payment action denied')
  })

  it('rejects authorization with a consumed mandate', async () => {
    const tenantId = 'tenant-chaos'
    const counterparty = await addCounterparty(fixture, tenantId)
    const agentId = await issueVerifiedAgent(fixture, 'consumed-mandate-owner', tenantId)
    const mandateId = await createMandate(fixture, agentId, 500, tenantId)

    // Consume the mandate
    await fixture.mandateService.consume(mandateId)

    // Validate directly — must be consumed
    const validationResult = await fixture.mandateService.validate(mandateId, { amount: 100 })
    expect(validationResult.valid).toBe(false)
    expect(validationResult.reason).toBe('consumed')

    const quote = await fixture.orchestrator.createQuote({
      tenantId,
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 100, currency: 'USD', quantity: 1 }],
      totalAmount: 100,
      currency: 'USD',
      expiresAt: '2026-03-11T12:00:00.000Z',
    })

    // The policy engine validates the mandate first — consumed mandate → active_mandate_required
    // which surfaces as 'Payment action denied: active_mandate_required'
    await expect(
      fixture.orchestrator.authorize(quote.quoteId, agentId, mandateId),
    ).rejects.toThrow('Payment action denied')
  })
})
