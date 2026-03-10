import { describe, expect, it } from 'vitest'
import { createAgentId } from '@shared/types'
import { AgentIdentityService } from './AgentIdentityService'
import { MandateService } from './MandateService'
import { TrustAuditLog } from './TrustAuditLog'
import { VerificationPolicyEngine } from './VerificationPolicyEngine'

async function setupVerifiedAgent() {
  const auditLog = new TrustAuditLog()
  const identityService = new AgentIdentityService(auditLog)
  const mandateService = new MandateService(auditLog)

  const identity = await identityService.issue({
    tenantId: 'tenant-1',
    ownerId: 'owner-1',
    ownerType: 'user',
    role: 'worker',
  })

  return { auditLog, identityService, mandateService, identity }
}

describe('VerificationPolicyEngine', () => {
  it('allows level 0 for unverified agent', async () => {
    const { identityService, mandateService, identity } = await setupVerifiedAgent()
    const engine = new VerificationPolicyEngine(identityService, mandateService)

    const decision = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'read_only_browse',
    })

    expect(decision.allowed).toBe(true)
    expect(decision.requiredLevel).toBe(0)
  })

  it('rejects level 1 for unverified agent', async () => {
    const { identityService, mandateService, identity } = await setupVerifiedAgent()
    const engine = new VerificationPolicyEngine(identityService, mandateService)

    const decision = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'external_api_call',
    })

    expect(decision).toMatchObject({
      allowed: false,
      reason: 'verification_required',
    })
  })

  it('requires mandate for level 2', async () => {
    const { identityService, mandateService, identity } = await setupVerifiedAgent()
    await identityService.verify(identity.agentId)

    const engine = new VerificationPolicyEngine(identityService, mandateService)
    const decision = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'payment_authorize',
    })

    expect(decision).toMatchObject({
      allowed: false,
      reason: 'active_mandate_required',
    })
  })

  it('requires wallet for level 3', async () => {
    const { identityService, mandateService, identity } = await setupVerifiedAgent()
    await identityService.verify(identity.agentId)
    const mandate = await mandateService.create({
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      delegatedAgentId: identity.agentId,
      purpose: 'wallet settlement',
      scope: ['payment'],
      expiresAt: '2099-01-01T00:00:00.000Z',
    })

    const engine = new VerificationPolicyEngine(identityService, mandateService)
    const decision = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'wallet_settlement',
      mandateId: mandate.mandateId,
    })

    expect(decision).toMatchObject({
      allowed: false,
      reason: 'wallet_binding_required',
    })
  })

  it('requires manual flag for level 4', async () => {
    const { identityService, mandateService, identity } = await setupVerifiedAgent()
    await identityService.verify(identity.agentId)
    const mandate = await mandateService.create({
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      delegatedAgentId: identity.agentId,
      purpose: 'enterprise operation',
      scope: ['payment'],
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    await identityService.bindWallet(identity.agentId, 'wallet-1')

    const engine = new VerificationPolicyEngine(identityService, mandateService)
    const decision = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'enterprise_sensitive',
      mandateId: mandate.mandateId,
      manualApproval: false,
    })

    expect(decision).toMatchObject({
      allowed: false,
      reason: 'manual_approval_required',
    })
  })

  it('blocks revoked agent at all levels', async () => {
    const { identityService, mandateService, identity } = await setupVerifiedAgent()
    await identityService.revoke(identity.agentId, 'security')

    const engine = new VerificationPolicyEngine(identityService, mandateService)
    const levelZeroDecision = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'read_only_browse',
    })
    const levelOneDecision = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'external_api_call',
    })

    expect(levelZeroDecision.reason).toBe('identity_revoked')
    expect(levelOneDecision.reason).toBe('identity_revoked')
  })

  it('blocks restricted agent above level 0', async () => {
    const { identityService, mandateService, identity } = await setupVerifiedAgent()
    await identityService.verify(identity.agentId)
    await identityService.restrict(identity.agentId, 'policy')

    const engine = new VerificationPolicyEngine(identityService, mandateService)

    const levelZero = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'read_only_browse',
    })
    const levelOne = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'external_api_call',
    })

    expect(levelZero.allowed).toBe(true)
    expect(levelOne).toMatchObject({
      allowed: false,
      reason: 'identity_restricted',
    })
  })

  it('supports custom action mapping', async () => {
    const { identityService, mandateService, identity } = await setupVerifiedAgent()
    await identityService.verify(identity.agentId)
    const mandate = await mandateService.create({
      tenantId: 'tenant-1',
      principalId: 'principal-1',
      delegatedAgentId: identity.agentId,
      purpose: 'deployment',
      scope: ['payment'],
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    await identityService.bindWallet(identity.agentId, 'wallet-1')

    const engine = new VerificationPolicyEngine(identityService, mandateService, {
      actionLevels: { deploy_production: 4 },
    })

    const denied = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'deploy_production',
      mandateId: mandate.mandateId,
      manualApproval: false,
    })

    const approved = await engine.evaluate({
      agentId: identity.agentId,
      actionType: 'deploy_production',
      mandateId: mandate.mandateId,
      manualApproval: true,
    })

    expect(denied.reason).toBe('manual_approval_required')
    expect(approved.allowed).toBe(true)
    expect(approved.requiredLevel).toBe(4)
  })

  it('returns identity_not_found for unknown agent', async () => {
    const { identityService, mandateService } = await setupVerifiedAgent()
    const engine = new VerificationPolicyEngine(identityService, mandateService)

    const decision = await engine.evaluate({
      agentId: createAgentId('missing-agent'),
      actionType: 'external_api_call',
    })

    expect(decision).toMatchObject({
      allowed: false,
      reason: 'identity_not_found',
    })
  })
})
