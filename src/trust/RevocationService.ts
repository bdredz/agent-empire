import { EventEmitter } from 'node:events'
import {
  AgentId,
  CounterpartyId,
  CounterpartyRecord,
  Mandate,
  MandateId,
} from '@shared/types'
import { CounterpartyRegistry } from './CounterpartyRegistry'
import { IAgentIdentityService } from './IAgentIdentityService'
import { IMandateService } from './IMandateService'
import {
  FrozenWalletStore,
  RevocationRuntimeOptions,
  appendRevocationAudit,
  blockCounterparty,
  createRuntimeOptions,
  emitRevocationAlert,
  freezeWalletBindings,
  requireIdentity,
  requireMandate,
  revokeActiveMandates,
  revokeIdentityStatus,
  resolveTenantId,
} from './RevocationSupport'
import { TrustAuditLog } from './TrustAuditLog'

export interface AgentRevocationSummary {
  agentRevoked: boolean
  mandatesRevoked: number
  walletsFrozen: number
}

export class RevocationService {
  private readonly walletStore = new FrozenWalletStore()
  private readonly runtime: RevocationRuntimeOptions

  constructor(
    private readonly identityService: IAgentIdentityService,
    private readonly mandateService: IMandateService,
    private readonly counterpartyRegistry: CounterpartyRegistry,
    private readonly trustAuditLog: TrustAuditLog,
    private readonly emitter?: EventEmitter,
    options: Partial<RevocationRuntimeOptions> = {},
  ) {
    this.runtime = createRuntimeOptions(options)
  }

  public async revokeAgent(
    agentId: AgentId,
    reason = 'revoked_by_policy',
  ): Promise<AgentRevocationSummary> {
    const identity = await requireIdentity(this.identityService, agentId)
    const mandatesRevoked = await revokeActiveMandates(
      this.mandateService,
      agentId,
      async (mandateId) => {
        await this.revokeMandate(mandateId)
      },
    )
    const walletsFrozen = await freezeWalletBindings(
      identity.walletBindings,
      async (walletId) => this.freezeWallet(walletId, identity.tenantId),
    )
    const agentRevoked = await revokeIdentityStatus(
      this.identityService,
      agentId,
      identity.verificationStatus,
      reason,
    )

    if (agentRevoked) {
      await this.appendAudit(identity.tenantId, 'identity_revoked', agentId, {
        reason,
        source: 'revocation_service',
      })
    }

    if (agentRevoked || mandatesRevoked > 0 || walletsFrozen > 0) {
      this.emitAlert(identity.tenantId, 'agent', agentId, 'critical', {
        reason,
        mandatesRevoked,
        walletsFrozen,
      })
    }

    return { agentRevoked, mandatesRevoked, walletsFrozen }
  }

  public async revokeMandate(mandateId: MandateId): Promise<Mandate> {
    const mandate = await requireMandate(this.mandateService, mandateId)
    if (mandate.status === 'revoked') {
      return mandate
    }

    const revoked = await this.mandateService.revoke(mandateId)
    await this.appendAudit(revoked.tenantId, 'mandate_revoked', mandateId, {
      source: 'revocation_service',
    })
    this.emitAlert(revoked.tenantId, 'mandate', mandateId, 'warning', {
      delegatedAgentId: revoked.delegatedAgentId,
    })

    return revoked
  }

  public async freezeWallet(walletId: string, tenantId?: string): Promise<boolean> {
    const resolvedTenantId = this.resolveTenantId(tenantId)
    if (!this.walletStore.freeze(resolvedTenantId, walletId)) {
      return false
    }

    await this.appendAudit(resolvedTenantId, 'wallet_frozen', walletId, {
      source: 'revocation_service',
    })
    this.emitAlert(resolvedTenantId, 'wallet', walletId, 'warning', {})

    return true
  }

  public async revokeCounterparty(
    counterpartyId: CounterpartyId,
    tenantId?: string,
  ): Promise<CounterpartyRecord> {
    const resolvedTenantId = this.resolveTenantId(tenantId)
    const existing = await this.counterpartyRegistry.get(
      resolvedTenantId,
      counterpartyId,
    )
    if (!existing) {
      throw new Error(`Counterparty not found: ${counterpartyId}`)
    }

    const blocked = await blockCounterparty(
      this.counterpartyRegistry,
      resolvedTenantId,
      counterpartyId,
    )

    if (blocked.trustStatus === 'blocked' && existing.trustStatus !== 'blocked') {
      await this.appendAudit(
        resolvedTenantId,
        'counterparty_blocked',
        counterpartyId,
        { source: 'revocation_service' },
      )
      this.emitAlert(resolvedTenantId, 'counterparty', counterpartyId, 'warning', {
        previousStatus: existing.trustStatus,
      })
    }

    return blocked
  }

  public isWalletFrozen(walletId: string, tenantId?: string): boolean {
    const resolvedTenantId = this.resolveTenantId(tenantId)
    return this.walletStore.isFrozen(resolvedTenantId, walletId)
  }

  private resolveTenantId(tenantId?: string): string {
    return resolveTenantId(this.runtime.defaultTenantId, tenantId)
  }

  private async appendAudit(
    tenantId: string,
    eventType: 'identity_revoked' | 'mandate_revoked' | 'counterparty_blocked' | 'wallet_frozen',
    subjectId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await appendRevocationAudit(
      this.trustAuditLog,
      this.runtime.now,
      this.runtime.actorId,
      tenantId,
      eventType,
      subjectId,
      details,
    )
  }

  private emitAlert(
    tenantId: string,
    targetType: 'agent' | 'mandate' | 'wallet' | 'counterparty',
    targetId: string,
    severity: 'info' | 'warning' | 'error' | 'critical',
    details: Record<string, unknown>,
  ): void {
    emitRevocationAlert(
      this.emitter,
      this.runtime.now,
      this.runtime.createEventId,
      tenantId,
      targetType,
      targetId,
      severity,
      details,
    )
  }
}
