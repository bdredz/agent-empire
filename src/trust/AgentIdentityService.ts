import { nanoid } from 'nanoid'
import {
  AgentId,
  AgentIdentity,
  TrustAuditEntry,
  createAgentId,
  createTrustAuditEntryId,
} from '@shared/types'
import {
  IAgentIdentityService,
  IssueAgentIdentityParams,
} from './IAgentIdentityService'
import { TrustAuditLog } from './TrustAuditLog'

export class AgentIdentityService implements IAgentIdentityService {
  private readonly identities = new Map<AgentId, AgentIdentity>()
  private readonly ownerKeys = new Set<string>()

  constructor(private readonly trustAuditLog: TrustAuditLog) {}

  public async issue(params: IssueAgentIdentityParams): Promise<AgentIdentity> {
    const ownerKey = createOwnerKey(params)
    if (this.ownerKeys.has(ownerKey)) {
      throw new Error('Agent identity already exists for owner and role')
    }

    const now = new Date().toISOString()
    const identity: AgentIdentity = {
      agentId: createAgentId(`agent_${nanoid()}`),
      tenantId: params.tenantId,
      businessUnitId: params.businessUnitId,
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      role: params.role,
      verificationStatus: 'unverified',
      walletBindings: [],
      createdAt: now,
      updatedAt: now,
    }

    this.identities.set(identity.agentId, identity)
    this.ownerKeys.add(ownerKey)
    await this.appendAudit(identity, 'identity_issued', {
      ownerId: identity.ownerId,
      ownerType: identity.ownerType,
      role: identity.role,
    })

    return cloneIdentity(identity)
  }

  public async get(agentId: AgentId): Promise<AgentIdentity | null> {
    const identity = this.identities.get(agentId)
    return identity ? cloneIdentity(identity) : null
  }

  public async verify(agentId: AgentId): Promise<AgentIdentity> {
    const identity = this.requireIdentity(agentId)
    if (identity.verificationStatus === 'revoked') {
      throw new Error('Revoked identity cannot be verified')
    }

    if (identity.verificationStatus !== 'verified') {
      await this.setStatus(identity, 'verified', 'identity_verified', {
        previousStatus: identity.verificationStatus,
      })
    }

    return cloneIdentity(identity)
  }

  public async restrict(agentId: AgentId, reason: string): Promise<AgentIdentity> {
    const identity = this.requireIdentity(agentId)
    if (identity.verificationStatus !== 'verified') {
      throw new Error('Only verified identities can be restricted')
    }

    await this.setStatus(identity, 'restricted', 'verification_override', { reason })
    return cloneIdentity(identity)
  }

  public async revoke(agentId: AgentId, reason: string): Promise<AgentIdentity> {
    const identity = this.requireIdentity(agentId)
    if (identity.verificationStatus !== 'revoked') {
      await this.setStatus(identity, 'revoked', 'identity_revoked', { reason })
    }

    return cloneIdentity(identity)
  }

  public async bindWallet(agentId: AgentId, walletId: string): Promise<AgentIdentity> {
    const identity = this.requireIdentity(agentId)
    if (!identity.walletBindings.includes(walletId)) {
      identity.walletBindings = [...identity.walletBindings, walletId]
      identity.updatedAt = new Date().toISOString()
      await this.appendAudit(identity, 'wallet_bound', { walletId })
    }

    return cloneIdentity(identity)
  }

  public async listByTenant(tenantId: string): Promise<AgentIdentity[]> {
    return Array.from(this.identities.values())
      .filter((identity) => identity.tenantId === tenantId)
      .map(cloneIdentity)
  }

  private requireIdentity(agentId: AgentId): AgentIdentity {
    const identity = this.identities.get(agentId)
    if (!identity) {
      throw new Error(`Agent identity not found: ${agentId}`)
    }

    return identity
  }

  private async setStatus(
    identity: AgentIdentity,
    status: AgentIdentity['verificationStatus'],
    eventType: TrustAuditEntry['eventType'],
    details: Record<string, unknown>,
  ): Promise<void> {
    identity.verificationStatus = status
    identity.updatedAt = new Date().toISOString()
    await this.appendAudit(identity, eventType, details)
  }

  private async appendAudit(
    identity: AgentIdentity,
    eventType: TrustAuditEntry['eventType'],
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.trustAuditLog.append({
      entryId: createTrustAuditEntryId(`trust_audit_${nanoid()}`),
      tenantId: identity.tenantId,
      eventType,
      subjectId: identity.agentId,
      actorId: 'system',
      details,
      timestamp: new Date().toISOString(),
    })
  }
}

function createOwnerKey(params: IssueAgentIdentityParams): string {
  return [
    params.tenantId,
    params.businessUnitId ?? '',
    params.ownerType,
    params.ownerId,
    params.role,
  ].join(':')
}

function cloneIdentity(identity: AgentIdentity): AgentIdentity {
  return {
    ...identity,
    walletBindings: [...identity.walletBindings],
  }
}
