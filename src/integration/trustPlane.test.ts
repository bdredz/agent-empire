import { describe, it, expect, beforeEach } from 'vitest'
import { TrustAuditLog } from '../trust/TrustAuditLog.js'
import { AgentIdentityService } from '../trust/AgentIdentityService.js'
import { MandateService } from '../trust/MandateService.js'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry.js'
import { VerificationPolicyEngine } from '../trust/VerificationPolicyEngine.js'
import { AgentReputationService } from '../trust/AgentReputationService.js'
import { RevocationService } from '../trust/RevocationService.js'
import type { AgentId, MandateId } from '@shared/types.js'

// ---------------------------------------------------------------------------
// Shared fixture types
// ---------------------------------------------------------------------------

interface TrustPlaneFixture {
  auditLog: TrustAuditLog
  identityService: AgentIdentityService
  mandateService: MandateService
  counterpartyRegistry: CounterpartyRegistry
  policyEngine: VerificationPolicyEngine
  reputationService: AgentReputationService
  revocationService: RevocationService
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function buildFixture(): TrustPlaneFixture {
  const auditLog = new TrustAuditLog()
  const identityService = new AgentIdentityService(auditLog)
  const mandateService = new MandateService(auditLog)
  const counterpartyRegistry = new CounterpartyRegistry()
  const policyEngine = new VerificationPolicyEngine(identityService, mandateService)
  const reputationService = new AgentReputationService(identityService)
  const revocationService = new RevocationService(
    identityService,
    mandateService,
    counterpartyRegistry,
    auditLog,
    undefined,
    { defaultTenantId: 'tenant-integration' },
  )

  return {
    auditLog,
    identityService,
    mandateService,
    counterpartyRegistry,
    policyEngine,
    reputationService,
    revocationService,
  }
}

async function issueAgent(
  fixture: TrustPlaneFixture,
  ownerId: string,
  tenantId = 'tenant-integration',
): Promise<AgentId> {
  const identity = await fixture.identityService.issue({
    tenantId,
    ownerId,
    ownerType: 'user',
    role: 'worker',
  })
  return identity.agentId
}

async function createActiveMandate(
  fixture: TrustPlaneFixture,
  delegatedAgentId: AgentId,
  tenantId = 'tenant-integration',
): Promise<MandateId> {
  const mandate = await fixture.mandateService.create({
    tenantId,
    principalId: 'principal-integration',
    delegatedAgentId,
    purpose: 'integration test mandate',
    scope: ['payment'],
    maxAmount: 500,
    currency: 'USD',
    expiresAt: '2099-12-31T00:00:00.000Z',
  })
  return mandate.mandateId
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Trust Plane — end-to-end integration', () => {
  let fixture: TrustPlaneFixture

  beforeEach(() => {
    fixture = buildFixture()
  })

  // -------------------------------------------------------------------------
  // Test 1: Identity lifecycle — issue → get → verify → revoke → verify gone
  // -------------------------------------------------------------------------

  it('full identity lifecycle: issue, get, verify, revoke, confirm gone', async () => {
    // Issue a fresh identity
    const identity = await fixture.identityService.issue({
      tenantId: 'tenant-integration',
      ownerId: 'lifecycle-owner-1',
      ownerType: 'user',
      role: 'worker',
    })

    expect(identity.agentId).toBeDefined()
    expect(identity.verificationStatus).toBe('unverified')
    expect(identity.walletBindings).toHaveLength(0)

    // Retrieve by id — must be identical
    const fetched = await fixture.identityService.get(identity.agentId)
    expect(fetched).not.toBeNull()
    expect(fetched!.agentId).toBe(identity.agentId)
    expect(fetched!.tenantId).toBe('tenant-integration')

    // Verify the identity
    const verified = await fixture.identityService.verify(identity.agentId)
    expect(verified.verificationStatus).toBe('verified')

    // Revoke it
    const revoked = await fixture.identityService.revoke(identity.agentId, 'test-revocation')
    expect(revoked.verificationStatus).toBe('revoked')

    // After revocation the identity still exists in the store but is revoked
    const afterRevoke = await fixture.identityService.get(identity.agentId)
    expect(afterRevoke).not.toBeNull()
    expect(afterRevoke!.verificationStatus).toBe('revoked')

    // Attempting to verify a revoked identity must throw
    await expect(
      fixture.identityService.verify(identity.agentId),
    ).rejects.toThrow('Revoked identity cannot be verified')
  })

  // -------------------------------------------------------------------------
  // Test 2: Mandate lifecycle — create → verify active → revoke → verify inactive
  // -------------------------------------------------------------------------

  it('mandate lifecycle: create, confirm active, revoke, confirm invalid', async () => {
    const agentId = await issueAgent(fixture, 'mandate-lifecycle-owner')

    // Create an active mandate
    const mandate = await fixture.mandateService.create({
      tenantId: 'tenant-integration',
      principalId: 'principal-lifecycle',
      delegatedAgentId: agentId,
      purpose: 'lifecycle mandate',
      scope: ['payment'],
      maxAmount: 200,
      currency: 'USD',
      expiresAt: '2099-12-31T00:00:00.000Z',
    })

    expect(mandate.status).toBe('active')
    expect(mandate.mandateId).toBeDefined()

    // Validate within constraints — must be valid
    const validResult = await fixture.mandateService.validate(mandate.mandateId, { amount: 100 })
    expect(validResult.valid).toBe(true)

    // Retrieve and confirm active
    const retrieved = await fixture.mandateService.get(mandate.mandateId)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.status).toBe('active')

    // Revoke the mandate
    const revoked = await fixture.mandateService.revoke(mandate.mandateId)
    expect(revoked.status).toBe('revoked')

    // Validation after revocation must fail
    const afterRevoke = await fixture.mandateService.validate(mandate.mandateId, { amount: 10 })
    expect(afterRevoke.valid).toBe(false)
    expect(afterRevoke.reason).toBe('revoked')

    // listByAgent still returns it (but revoked)
    const agentMandates = await fixture.mandateService.listByAgent(agentId)
    expect(agentMandates).toHaveLength(1)
    expect(agentMandates[0]!.status).toBe('revoked')
  })

  // -------------------------------------------------------------------------
  // Test 3: Trust level enforcement via VerificationPolicyEngine
  // -------------------------------------------------------------------------

  it('policy engine enforces trust levels: unverified blocks ≥L1, verified+mandate+wallet allows L3', async () => {
    const agentId = await issueAgent(fixture, 'policy-engine-owner')

    // L0 (read_only_browse) is allowed even for unverified agents
    const l0Unverified = await fixture.policyEngine.evaluate({
      agentId,
      actionType: 'read_only_browse',
    })
    expect(l0Unverified.allowed).toBe(true)
    expect(l0Unverified.requiredLevel).toBe(0)

    // L1 (external_api_call) is blocked for unverified agents
    const l1Unverified = await fixture.policyEngine.evaluate({
      agentId,
      actionType: 'external_api_call',
    })
    expect(l1Unverified.allowed).toBe(false)
    expect(l1Unverified.reason).toBe('verification_required')

    // Verify the agent — now L1 is allowed
    await fixture.identityService.verify(agentId)
    const l1Verified = await fixture.policyEngine.evaluate({
      agentId,
      actionType: 'external_api_call',
    })
    expect(l1Verified.allowed).toBe(true)
    expect(l1Verified.requiredLevel).toBe(1)

    // L2 (payment_authorize) requires an active mandate
    const l2NoMandate = await fixture.policyEngine.evaluate({
      agentId,
      actionType: 'payment_authorize',
    })
    expect(l2NoMandate.allowed).toBe(false)
    expect(l2NoMandate.reason).toBe('active_mandate_required')

    // Create a mandate and confirm L2 is allowed
    const mandateId = await createActiveMandate(fixture, agentId)
    const l2WithMandate = await fixture.policyEngine.evaluate({
      agentId,
      actionType: 'payment_authorize',
      mandateId,
    })
    expect(l2WithMandate.allowed).toBe(true)
    expect(l2WithMandate.requiredLevel).toBe(2)

    // L3 (wallet_settlement) requires a wallet binding
    const l3NoWallet = await fixture.policyEngine.evaluate({
      agentId,
      actionType: 'wallet_settlement',
      mandateId,
    })
    expect(l3NoWallet.allowed).toBe(false)
    expect(l3NoWallet.reason).toBe('wallet_binding_required')

    // Bind a wallet and confirm L3 is allowed
    await fixture.identityService.bindWallet(agentId, 'integration-wallet-1')
    const l3WithWallet = await fixture.policyEngine.evaluate({
      agentId,
      actionType: 'wallet_settlement',
      mandateId,
    })
    expect(l3WithWallet.allowed).toBe(true)
    expect(l3WithWallet.requiredLevel).toBe(3)
  })

  // -------------------------------------------------------------------------
  // Test 4: Counterparty registration, query, and blocking
  // -------------------------------------------------------------------------

  it('counterparty registration: add, query, apply risk events, block', async () => {
    const tenantId = 'tenant-integration'

    // Register a counterparty
    const counterparty = await fixture.counterpartyRegistry.add(tenantId, {
      displayName: 'Acme Vendor',
      counterpartyType: 'merchant',
      trustStatus: 'unknown',
      tags: ['vendor', 'acme'],
    })

    expect(counterparty.counterpartyId).toBeDefined()
    expect(counterparty.trustStatus).toBe('unknown')
    expect(counterparty.riskScore).toBe(50)

    // Retrieve by id
    const fetched = await fixture.counterpartyRegistry.get(tenantId, counterparty.counterpartyId)
    expect(fetched).not.toBeNull()
    expect(fetched!.displayName).toBe('Acme Vendor')

    // Promote to trusted
    const trusted = await fixture.counterpartyRegistry.updateTrustStatus(
      tenantId,
      counterparty.counterpartyId,
      'trusted',
    )
    expect(trusted.trustStatus).toBe('trusted')

    // Record a policy violation — risk score drops
    const afterViolation = await fixture.counterpartyRegistry.recordRiskEvent(
      tenantId,
      counterparty.counterpartyId,
      'policy_violation',
    )
    expect(afterViolation.riskScore).toBe(35) // 50 - 15 (delta for policy_violation)

    // Move to watch before blocking (required by transition rules)
    await fixture.counterpartyRegistry.updateTrustStatus(
      tenantId,
      counterparty.counterpartyId,
      'watch',
    )

    // Block the counterparty
    const blocked = await fixture.counterpartyRegistry.updateTrustStatus(
      tenantId,
      counterparty.counterpartyId,
      'blocked',
    )
    expect(blocked.trustStatus).toBe('blocked')

    // Attempting further transition from blocked must throw
    await expect(
      fixture.counterpartyRegistry.updateTrustStatus(
        tenantId,
        counterparty.counterpartyId,
        'trusted',
      ),
    ).rejects.toThrow('Invalid trust status transition: blocked -> trusted')

    // List by tag — must find the blocked counterparty
    const byTag = await fixture.counterpartyRegistry.listByTag(tenantId, 'acme')
    expect(byTag).toHaveLength(1)
    expect(byTag[0]!.counterpartyId).toBe(counterparty.counterpartyId)
  })

  // -------------------------------------------------------------------------
  // Test 5: Reputation tracking across positive and negative events
  // -------------------------------------------------------------------------

  it('reputation service tracks positive and negative events and adjusts score', async () => {
    const agentId = await issueAgent(fixture, 'reputation-owner')

    // Initial report — no tasks recorded: successRate = 0/max(1,0) = 0/1 = 0
    const initialReport = await fixture.reputationService.getReport(agentId)
    expect(initialReport.agentId).toBe(agentId)
    expect(initialReport.successRate).toBe(0) // 0 successful / max(1, 0 total) = 0
    expect(initialReport.score).toBeGreaterThan(0)

    // Record several successful tasks
    await fixture.reputationService.recordEvent(agentId, 'task_completed')
    await fixture.reputationService.recordEvent(agentId, 'task_completed')
    await fixture.reputationService.recordEvent(agentId, 'task_completed')

    const afterSuccess = await fixture.reputationService.getReport(agentId)
    expect(afterSuccess.successRate).toBeCloseTo(1.0, 5) // 3 successes / 3 total
    expect(afterSuccess.score).toBeGreaterThan(initialReport.score)

    // Record a task failure — success rate and score both drop
    await fixture.reputationService.recordEvent(agentId, 'task_failed')
    const afterFailure = await fixture.reputationService.getReport(agentId)
    expect(afterFailure.successRate).toBeLessThan(1.0) // 3/4
    expect(afterFailure.score).toBeLessThan(afterSuccess.score)

    // Record a policy violation — score drops further
    await fixture.reputationService.recordEvent(agentId, 'policy_violation')
    const afterViolation = await fixture.reputationService.getReport(agentId)
    expect(afterViolation.policyViolationRate).toBeGreaterThan(0)
    expect(afterViolation.score).toBeLessThan(afterFailure.score)

    // Heartbeat — uptime score improves future calculations
    await fixture.reputationService.recordEvent(agentId, 'heartbeat')
    const afterHeartbeat = await fixture.reputationService.getReport(agentId)
    expect(afterHeartbeat.uptimeScore).toBe(1) // heartbeat was very recent

    // recordEvent on an unknown agent must throw
    const unknownId = 'agent_unknown_xyz' as AgentId
    await expect(
      fixture.reputationService.recordEvent(unknownId, 'task_completed'),
    ).rejects.toThrow('Identity not found for agent')
  })

  // -------------------------------------------------------------------------
  // Test 6: Cascading revocation — revoke agent → mandates also revoked
  // -------------------------------------------------------------------------

  it('cascading revocation: revoking agent revokes active mandates and freezes wallets', async () => {
    const agentId = await issueAgent(fixture, 'cascade-owner')

    // Create two active mandates for this agent
    const mandateIdA = await createActiveMandate(fixture, agentId)
    const mandateIdB = await createActiveMandate(fixture, agentId)

    // Create a consumed mandate — should NOT be re-revoked
    const consumed = await fixture.mandateService.create({
      tenantId: 'tenant-integration',
      principalId: 'principal-cascade',
      delegatedAgentId: agentId,
      purpose: 'consumed mandate',
      scope: ['payment'],
      expiresAt: '2099-12-31T00:00:00.000Z',
    })
    await fixture.mandateService.consume(consumed.mandateId)

    // Bind wallets to the agent
    await fixture.identityService.bindWallet(agentId, 'wallet-cascade-1')
    await fixture.identityService.bindWallet(agentId, 'wallet-cascade-2')

    // Execute cascading revocation
    const summary = await fixture.revocationService.revokeAgent(agentId, 'security_incident')

    expect(summary.agentRevoked).toBe(true)
    expect(summary.mandatesRevoked).toBe(2) // only the 2 active ones
    expect(summary.walletsFrozen).toBe(2)

    // Agent identity must be revoked
    const revokedIdentity = await fixture.identityService.get(agentId)
    expect(revokedIdentity!.verificationStatus).toBe('revoked')

    // Both active mandates must be revoked
    const mandateA = await fixture.mandateService.get(mandateIdA)
    const mandateB = await fixture.mandateService.get(mandateIdB)
    expect(mandateA!.status).toBe('revoked')
    expect(mandateB!.status).toBe('revoked')

    // Consumed mandate must remain consumed (not double-revoked)
    const consumedAfter = await fixture.mandateService.get(consumed.mandateId)
    expect(consumedAfter!.status).toBe('consumed')

    // Wallets must be frozen
    expect(fixture.revocationService.isWalletFrozen('wallet-cascade-1', 'tenant-integration')).toBe(true)
    expect(fixture.revocationService.isWalletFrozen('wallet-cascade-2', 'tenant-integration')).toBe(true)

    // Policy engine must now block the revoked agent even at level 0
    const decision = await fixture.policyEngine.evaluate({
      agentId,
      actionType: 'read_only_browse',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('identity_revoked')
  })

  // -------------------------------------------------------------------------
  // Test 7: Audit trail completeness across all trust operations
  // -------------------------------------------------------------------------

  it('audit log captures all trust plane events across identity, mandate, and revocation', async () => {
    const tenantId = 'tenant-integration'

    // Issue and verify an identity
    const identity = await fixture.identityService.issue({
      tenantId,
      ownerId: 'audit-trail-owner',
      ownerType: 'organization',
      role: 'worker',
    })
    await fixture.identityService.verify(identity.agentId)

    // Bind a wallet
    await fixture.identityService.bindWallet(identity.agentId, 'wallet-audit')

    // Create and consume a mandate
    const mandate = await fixture.mandateService.create({
      tenantId,
      principalId: 'principal-audit',
      delegatedAgentId: identity.agentId,
      purpose: 'audit trail mandate',
      scope: ['payment'],
      expiresAt: '2099-12-31T00:00:00.000Z',
    })
    await fixture.mandateService.consume(mandate.mandateId)

    // Create another mandate and then revoke it via RevocationService
    const mandate2 = await fixture.mandateService.create({
      tenantId,
      principalId: 'principal-audit',
      delegatedAgentId: identity.agentId,
      purpose: 'second audit mandate',
      scope: ['payment'],
      expiresAt: '2099-12-31T00:00:00.000Z',
    })
    await fixture.revocationService.revokeMandate(mandate2.mandateId)

    // Freeze a wallet
    await fixture.revocationService.freezeWallet('wallet-audit', tenantId)

    // Verify audit entries for each event type that occurred

    // identity_issued
    const issuedEntries = await fixture.auditLog.query({
      tenantId,
      eventType: 'identity_issued',
      subjectId: identity.agentId,
    })
    expect(issuedEntries).toHaveLength(1)
    expect(issuedEntries[0]!.subjectId).toBe(identity.agentId)

    // identity_verified
    const verifiedEntries = await fixture.auditLog.query({
      tenantId,
      eventType: 'identity_verified',
      subjectId: identity.agentId,
    })
    expect(verifiedEntries).toHaveLength(1)

    // wallet_bound
    const walletBoundEntries = await fixture.auditLog.query({
      tenantId,
      eventType: 'wallet_bound',
      subjectId: identity.agentId,
    })
    expect(walletBoundEntries).toHaveLength(1)

    // mandate_created (two mandates were created)
    const mandateCreatedEntries = await fixture.auditLog.query({
      tenantId,
      eventType: 'mandate_created',
    })
    expect(mandateCreatedEntries).toHaveLength(2)

    // mandate_consumed
    const mandateConsumedEntries = await fixture.auditLog.query({
      tenantId,
      eventType: 'mandate_consumed',
    })
    expect(mandateConsumedEntries).toHaveLength(1)
    expect(mandateConsumedEntries[0]!.subjectId).toBe(mandate.mandateId)

    // mandate_revoked (via RevocationService writes its own entry plus MandateService.revoke)
    const mandateRevokedEntries = await fixture.auditLog.query({
      tenantId,
      eventType: 'mandate_revoked',
    })
    expect(mandateRevokedEntries.length).toBeGreaterThanOrEqual(1)

    // wallet_frozen
    const walletFrozenEntries = await fixture.auditLog.query({
      tenantId,
      eventType: 'wallet_frozen',
    })
    expect(walletFrozenEntries).toHaveLength(1)

    // Full tenant query must contain all events
    const allEntries = await fixture.auditLog.query({ tenantId })
    const eventTypes = allEntries.map((e) => e.eventType)
    expect(eventTypes).toContain('identity_issued')
    expect(eventTypes).toContain('identity_verified')
    expect(eventTypes).toContain('wallet_bound')
    expect(eventTypes).toContain('mandate_created')
    expect(eventTypes).toContain('mandate_consumed')
    expect(eventTypes).toContain('mandate_revoked')
    expect(eventTypes).toContain('wallet_frozen')
  })
})
