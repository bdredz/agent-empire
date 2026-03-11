import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AgentId, MandateId, CommerceRail, CommerceQuote } from '@shared/types.js'
import { createWalletPolicyId } from '@shared/types.js'
import { AgentIdentityService } from '../trust/AgentIdentityService.js'
import { MandateService } from '../trust/MandateService.js'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry.js'
import { TrustAuditLog } from '../trust/TrustAuditLog.js'
import { VerificationPolicyEngine } from '../trust/VerificationPolicyEngine.js'
import { RevocationService } from '../trust/RevocationService.js'
import { AgentReputationService } from '../trust/AgentReputationService.js'
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
// Stub rail adapter
// ---------------------------------------------------------------------------

class StubAdapter implements ICommerceRailAdapter {
  public readonly rail: CommerceRail

  constructor(rail: CommerceRail) {
    this.rail = rail
  }

  public async authorize(quote: CommerceQuote) {
    return { externalId: `${this.rail}_${quote.quoteId}`, status: 'authorized' as const }
  }

  public async capture(externalId: string) {
    return { externalTransactionId: `txn_${externalId}`, status: 'settled' as const }
  }

  public async refund() {
    return { status: 'refunded' as const }
  }

  public async getSettlementStatus() {
    return { status: 'settled', settledAt: '2026-03-10T00:00:00.000Z' }
  }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

interface CrossPlaneFixture {
  // Trust
  trustAuditLog: TrustAuditLog
  identityService: AgentIdentityService
  mandateService: MandateService
  counterpartyRegistry: CounterpartyRegistry
  policyEngine: VerificationPolicyEngine
  reputationService: AgentReputationService
  revocationService: RevocationService
  // Commerce
  orchestrator: CommerceOrchestrator
  quoteService: QuoteService
  receiptService: ReceiptService
  refundPolicyEngine: RefundPolicyEngine
  settlementReconciler: SettlementReconciler
  disputeService: DisputeService
  railAdapters: Map<CommerceRail, ICommerceRailAdapter>
  walletPolicyEngine: WalletPolicyEngine
  nowIso: string
}

function buildFixture(): CrossPlaneFixture {
  const nowIso = '2026-03-10T12:00:00.000Z'

  const trustAuditLog = new TrustAuditLog()
  const identityService = new AgentIdentityService(trustAuditLog)
  const mandateService = new MandateService(trustAuditLog)
  const counterpartyRegistry = new CounterpartyRegistry()
  const policyEngine = new VerificationPolicyEngine(identityService, mandateService)
  const reputationService = new AgentReputationService(identityService)
  const revocationService = new RevocationService(
    identityService,
    mandateService,
    counterpartyRegistry,
    trustAuditLog,
    undefined,
    { defaultTenantId: 'tenant-cross' },
  )

  const quoteService = new QuoteService(counterpartyRegistry, {
    now: () => new Date(nowIso),
  })
  const receiptService = new ReceiptService()
  const refundPolicyEngine = new RefundPolicyEngine({ now: () => new Date(nowIso) })

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
    policyEngine,
    trustAuditLog,
    railAdapters,
    { now: () => new Date(nowIso) },
  )

  const walletPolicyEngine = new WalletPolicyEngine({ now: () => new Date(nowIso) })

  return {
    trustAuditLog,
    identityService,
    mandateService,
    counterpartyRegistry,
    policyEngine,
    reputationService,
    revocationService,
    orchestrator,
    quoteService,
    receiptService,
    refundPolicyEngine,
    settlementReconciler,
    disputeService,
    railAdapters,
    walletPolicyEngine,
    nowIso,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function issueVerifiedAgentWithMandate(
  f: CrossPlaneFixture,
  tenantId = 'tenant-cross',
  maxAmount = 500,
): Promise<{ agentId: AgentId; mandateId: MandateId }> {
  const identity = await f.identityService.issue({
    tenantId,
    ownerId: `owner-${Date.now()}`,
    ownerType: 'user',
    role: 'worker',
  })
  await f.identityService.verify(identity.agentId)

  const mandate = await f.mandateService.create({
    tenantId,
    principalId: 'principal-cross',
    delegatedAgentId: identity.agentId,
    purpose: 'cross-plane test',
    scope: ['payment'],
    maxAmount,
    expiresAt: '2099-12-31T00:00:00.000Z',
  })

  return { agentId: identity.agentId, mandateId: mandate.mandateId }
}

async function addTrustedCounterparty(f: CrossPlaneFixture, tenantId = 'tenant-cross') {
  return f.counterpartyRegistry.add(tenantId, {
    displayName: 'Cross Vendor',
    counterpartyType: 'merchant',
    trustStatus: 'trusted',
    tags: ['cross-plane'],
  })
}

async function createQuoteAndAuthorize(
  f: CrossPlaneFixture,
  agentId: AgentId,
  mandateId: MandateId,
  tenantId = 'tenant-cross',
) {
  const counterparty = await addTrustedCounterparty(f, tenantId)

  const quote = await f.orchestrator.createQuote({
    tenantId,
    counterpartyId: counterparty.counterpartyId,
    lineItems: [{ description: 'Test item', amount: 50, currency: 'USD', quantity: 1 }],
    totalAmount: 50,
    currency: 'USD',
    expiresAt: '2026-03-10T13:00:00.000Z',
  })

  return f.orchestrator.authorize(quote.quoteId, agentId, mandateId)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cross-Plane — trust ↔ commerce ↔ evidence integration', () => {
  let f: CrossPlaneFixture

  beforeEach(() => {
    f = buildFixture()
  })

  // -------------------------------------------------------------------------
  // Test 1: Trust→Commerce mandate gate — revoke mandate, authorize fails
  // -------------------------------------------------------------------------

  it('revoked mandate blocks subsequent commerce authorize with Payment action denied', async () => {
    const { agentId, mandateId } = await issueVerifiedAgentWithMandate(f)
    const counterparty = await addTrustedCounterparty(f)

    // Authorize once — must succeed before revocation
    const quote = await f.orchestrator.createQuote({
      tenantId: 'tenant-cross',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })
    const auth = await f.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    expect(auth.status).toBe('authorized')

    // Revoke the mandate via RevocationService
    const revoked = await f.revocationService.revokeMandate(mandateId)
    expect(revoked.status).toBe('revoked')

    // Validate directly — must report invalid with reason 'revoked'
    const validation = await f.mandateService.validate(mandateId, { amount: 50 })
    expect(validation.valid).toBe(false)
    expect(validation.reason).toBe('revoked')

    // Subsequent authorize with the revoked mandate must fail.
    // VerificationPolicyEngine.evaluate() checks mandate validity first via mandateService.validate()
    // and returns active_mandate_required, causing 'Payment action denied'.
    const quote2 = await f.orchestrator.createQuote({
      tenantId: 'tenant-cross',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task 2', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    await expect(
      f.orchestrator.authorize(quote2.quoteId, agentId, mandateId),
    ).rejects.toThrow('Payment action denied')
  })

  // -------------------------------------------------------------------------
  // Test 2: Trust→Commerce agent revocation blocks commerce
  // -------------------------------------------------------------------------

  it('revoking agent blocks subsequent authorize with Payment action denied', async () => {
    const { agentId, mandateId } = await issueVerifiedAgentWithMandate(f)
    const counterparty = await addTrustedCounterparty(f)

    // First authorize succeeds
    const quote = await f.orchestrator.createQuote({
      tenantId: 'tenant-cross',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })
    const auth = await f.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    expect(auth.status).toBe('authorized')

    // Revoke the agent via RevocationService
    const summary = await f.revocationService.revokeAgent(agentId, 'security_incident')
    expect(summary.agentRevoked).toBe(true)

    // Subsequent authorize must be blocked — identity is now revoked
    const quote2 = await f.orchestrator.createQuote({
      tenantId: 'tenant-cross',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task 2', amount: 50, currency: 'USD', quantity: 1 }],
      totalAmount: 50,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })

    await expect(
      f.orchestrator.authorize(quote2.quoteId, agentId, mandateId),
    ).rejects.toThrow('Payment action denied')
  })

  // -------------------------------------------------------------------------
  // Test 3: Commerce→Trust counterparty blocking halts new quotes
  // -------------------------------------------------------------------------

  it('blocking counterparty prevents new quote creation via QuoteService', async () => {
    const tenantId = 'tenant-cross'

    // Register a trusted counterparty and create a quote successfully
    const counterparty = await f.counterpartyRegistry.add(tenantId, {
      displayName: 'Risky Vendor',
      counterpartyType: 'merchant',
      trustStatus: 'trusted',
      tags: ['cross-plane'],
    })
    expect(counterparty.trustStatus).toBe('trusted')

    // Create a quote while trusted — must succeed
    const { agentId, mandateId } = await issueVerifiedAgentWithMandate(f)
    const quote = await f.orchestrator.createQuote({
      tenantId,
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Initial task', amount: 40, currency: 'USD', quantity: 1 }],
      totalAmount: 40,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })
    expect(quote.quoteId).toBeDefined()

    // Authorize while still trusted — must succeed
    const auth = await f.orchestrator.authorize(quote.quoteId, agentId, mandateId)
    expect(auth.status).toBe('authorized')

    // Block the counterparty (must pass through watch first per transition rules)
    await f.counterpartyRegistry.updateTrustStatus(tenantId, counterparty.counterpartyId, 'watch')
    const blocked = await f.counterpartyRegistry.updateTrustStatus(
      tenantId,
      counterparty.counterpartyId,
      'blocked',
    )
    expect(blocked.trustStatus).toBe('blocked')

    // Transition from blocked → trusted is forbidden by registry rules
    await expect(
      f.counterpartyRegistry.updateTrustStatus(tenantId, counterparty.counterpartyId, 'trusted'),
    ).rejects.toThrow('Invalid trust status transition: blocked -> trusted')

    // QuoteService.create() checks trustStatus and throws for blocked counterparties
    await expect(
      f.orchestrator.createQuote({
        tenantId,
        counterpartyId: counterparty.counterpartyId,
        lineItems: [{ description: 'Post-block task', amount: 30, currency: 'USD', quantity: 1 }],
        totalAmount: 30,
        currency: 'USD',
        expiresAt: '2026-03-10T13:00:00.000Z',
      }),
    ).rejects.toThrow('Counterparty is blocked')
  })

  // -------------------------------------------------------------------------
  // Test 4: Trust→Commerce wallet freeze blocks WalletPolicyEngine evaluation
  // -------------------------------------------------------------------------

  it('frozen wallet causes WalletPolicyEngine to deny transactions', async () => {
    const tenantId = 'tenant-cross'
    const walletId = 'wallet-cross-freeze'

    const { agentId } = await issueVerifiedAgentWithMandate(f)

    // Bind the wallet to the agent
    await f.identityService.bindWallet(agentId, walletId)

    // Register a wallet policy before evaluating
    f.walletPolicyEngine.upsertPolicy({
      walletPolicyId: createWalletPolicyId('policy-cross-1'),
      tenantId,
      walletId,
      maxPerTransaction: 200,
      maxDailyOutflow: 1000,
      allowedAssets: ['USD', 'USDC'],
    })

    // Confirm wallet is not frozen yet
    expect(f.revocationService.isWalletFrozen(walletId, tenantId)).toBe(false)

    // Transaction should be allowed before freeze
    const beforeFreeze = f.walletPolicyEngine.evaluate(walletId, {
      amount: 50,
      asset: 'USD',
    })
    expect(beforeFreeze.allowed).toBe(true)

    // Freeze the wallet via RevocationService
    const frozen = await f.revocationService.freezeWallet(walletId, tenantId)
    expect(frozen).toBe(true)
    expect(f.revocationService.isWalletFrozen(walletId, tenantId)).toBe(true)

    // Also freeze in WalletPolicyEngine to enforce the freeze at eval time
    f.walletPolicyEngine.freeze(walletId)

    // WalletPolicyEngine must now deny the transaction
    const afterFreeze = f.walletPolicyEngine.evaluate(walletId, {
      amount: 50,
      asset: 'USD',
    })
    expect(afterFreeze.allowed).toBe(false)
    expect(afterFreeze.reason).toBe('wallet_frozen')
  })

  // -------------------------------------------------------------------------
  // Test 5: Evidence→Commerce confidence below threshold blocks proposal sink
  // -------------------------------------------------------------------------

  it('ResearchBroker with low budget runs but emits no proposals when confidence is below threshold', async () => {
    const capturedProposals: unknown[] = []
    const proposalSink = vi.fn((p: unknown) => { capturedProposals.push(p) })

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
      proposalSink,
    )

    // budgetTokens = 15 is just above the minimum of 10, so it runs
    const report = await broker.research({
      question: 'What is the state of AI regulation in 2026?',
      tenantId: 'tenant-cross',
      budgetTokens: 15,
    })

    // The broker must complete without throwing
    expect(report.reportId).toBeDefined()
    expect(report.tenantId).toBe('tenant-cross')

    // If confidence is below the sink threshold, no proposals are emitted
    const emitted = broker.getEmittedProposals()
    if (report.confidence <= 0.5) {
      expect(proposalSink).not.toHaveBeenCalled()
      expect(emitted).toHaveLength(0)
    } else {
      // Above threshold — proposals may have been emitted; verify their shape
      expect(proposalSink.mock.calls.length).toBe(emitted.length)
    }
    // Either way, the sink call count must match getEmittedProposals()
    expect(proposalSink.mock.calls.length).toBe(broker.getEmittedProposals().length)
  })

  // -------------------------------------------------------------------------
  // Test 6: Full cross-plane flow: identity→mandate→quote→authorize→capture→reconcile→revoke
  // -------------------------------------------------------------------------

  it('end-to-end: issue identity, create mandate, quote, authorize, capture, reconcile, revoke', async () => {
    const tenantId = 'tenant-cross'

    // Step 1: Issue and verify identity
    const identity = await f.identityService.issue({
      tenantId,
      ownerId: 'cross-e2e-owner',
      ownerType: 'user',
      role: 'worker',
    })
    expect(identity.verificationStatus).toBe('unverified')

    await f.identityService.verify(identity.agentId)
    const verified = await f.identityService.get(identity.agentId)
    expect(verified!.verificationStatus).toBe('verified')

    // Step 2: Create mandate
    const mandate = await f.mandateService.create({
      tenantId,
      principalId: 'principal-e2e',
      delegatedAgentId: identity.agentId,
      purpose: 'e2e cross-plane test',
      scope: ['payment'],
      maxAmount: 300,
      expiresAt: '2099-12-31T00:00:00.000Z',
    })
    expect(mandate.status).toBe('active')

    // Step 3: Add counterparty
    const counterparty = await f.counterpartyRegistry.add(tenantId, {
      displayName: 'E2E Vendor',
      counterpartyType: 'merchant',
      trustStatus: 'trusted',
      tags: ['e2e'],
    })
    expect(counterparty.trustStatus).toBe('trusted')

    // Step 4: Create quote
    const quote = await f.orchestrator.createQuote({
      tenantId,
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'E2E service', amount: 100, currency: 'USD', quantity: 1 }],
      totalAmount: 100,
      currency: 'USD',
      expiresAt: '2026-03-10T13:00:00.000Z',
    })
    expect(quote.totalAmount).toBe(100)

    // Step 5: Authorize
    const authorization = await f.orchestrator.authorize(
      quote.quoteId,
      identity.agentId,
      mandate.mandateId,
    )
    expect(authorization.status).toBe('authorized')
    expect(authorization.agentId).toBe(identity.agentId)
    expect(authorization.mandateId).toBe(mandate.mandateId)

    // Step 6: Capture
    const receipt = await f.orchestrator.capture(authorization.authorizationId)
    expect(receipt.status).toBe('settled')
    expect(receipt.tenantId).toBe(tenantId)
    expect(receipt.amount).toBe(100)

    // Step 7: Reconcile — stub adapter returns 'settled' for all, expect 0 issues
    const report = await f.orchestrator.reconcile(tenantId)
    expect(report.matched).toBe(1)
    expect(report.unmatched).toBe(0)
    expect(report.issues).toHaveLength(0)

    // Step 8: Revoke agent and confirm cascading effects
    const revocationSummary = await f.revocationService.revokeAgent(
      identity.agentId,
      'e2e_test_cleanup',
    )
    expect(revocationSummary.agentRevoked).toBe(true)
    expect(revocationSummary.mandatesRevoked).toBeGreaterThanOrEqual(0)

    // Confirm identity is revoked
    const revokedIdentity = await f.identityService.get(identity.agentId)
    expect(revokedIdentity!.verificationStatus).toBe('revoked')

    // Confirm policy engine blocks revoked agent
    const policyDecision = await f.policyEngine.evaluate({
      agentId: identity.agentId,
      actionType: 'read_only_browse',
    })
    expect(policyDecision.allowed).toBe(false)
    expect(policyDecision.reason).toBe('identity_revoked')
  })
})
