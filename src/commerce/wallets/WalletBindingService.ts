import { nanoid } from 'nanoid'
import {
  AgentId,
  TrustAuditEntry,
  createTrustAuditEntryId,
} from '@shared/types'
import { IAgentIdentityService } from '../../trust/IAgentIdentityService'
import { TrustAuditLog } from '../../trust/TrustAuditLog'

interface WalletBinding {
  agentId: AgentId
  tenantId: string
}

export interface WalletBindingServiceOptions {
  now?: () => Date
  idFactory?: () => string
}

export class WalletBindingService {
  private readonly walletToBinding = new Map<string, WalletBinding>()
  private readonly agentToWallets = new Map<AgentId, Set<string>>()
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(
    private readonly identityService: IAgentIdentityService,
    private readonly trustAuditLog: TrustAuditLog,
    options: Partial<WalletBindingServiceOptions> = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => nanoid())
  }

  public async bindWallet(agentId: AgentId, walletId: string): Promise<void> {
    if (this.walletToBinding.has(walletId)) {
      throw new Error(`Wallet already bound: ${walletId}`)
    }

    const identity = await this.identityService.get(agentId)
    if (!identity) {
      throw new Error(`Agent identity not found: ${agentId}`)
    }
    if (identity.verificationStatus !== 'verified') {
      throw new Error(`Agent identity must be verified: ${agentId}`)
    }

    this.walletToBinding.set(walletId, {
      agentId,
      tenantId: identity.tenantId,
    })

    const wallets = this.agentToWallets.get(agentId) ?? new Set<string>()
    wallets.add(walletId)
    this.agentToWallets.set(agentId, wallets)

    await this.appendAudit(identity.tenantId, 'wallet_bound', walletId, agentId, {
      walletId,
      agentId,
    })
  }

  public async unbindWallet(walletId: string): Promise<void> {
    const binding = this.walletToBinding.get(walletId)
    if (!binding) {
      return
    }

    this.walletToBinding.delete(walletId)

    const wallets = this.agentToWallets.get(binding.agentId)
    if (wallets) {
      wallets.delete(walletId)
      if (wallets.size === 0) {
        this.agentToWallets.delete(binding.agentId)
      }
    }

    await this.appendAudit(
      binding.tenantId,
      'verification_override',
      walletId,
      binding.agentId,
      { action: 'wallet_unbound', walletId, agentId: binding.agentId },
    )
  }

  public async listWalletsForAgent(agentId: AgentId): Promise<string[]> {
    const wallets = this.agentToWallets.get(agentId)
    if (!wallets) {
      return []
    }

    return Array.from(wallets.values()).sort()
  }

  public async listAgentsForWallet(walletId: string): Promise<AgentId[]> {
    const binding = this.walletToBinding.get(walletId)
    if (!binding) {
      return []
    }

    return [binding.agentId]
  }

  private async appendAudit(
    tenantId: string,
    eventType: TrustAuditEntry['eventType'],
    subjectId: string,
    actorId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.trustAuditLog.append({
      entryId: createTrustAuditEntryId(`trust_audit_${this.idFactory()}`),
      tenantId,
      eventType,
      subjectId,
      actorId,
      details,
      timestamp: this.now().toISOString(),
    })
  }
}
