import {
  AgentId,
  MandateId,
  TrustLevel,
} from '@shared/types'
import { IAgentIdentityService } from './IAgentIdentityService'
import { IMandateService } from './IMandateService'

export interface VerificationPolicyInput {
  agentId: AgentId
  actionType: string
  mandateId?: MandateId
  manualApproval?: boolean
}

export interface VerificationPolicyDecision {
  allowed: boolean
  requiredLevel: TrustLevel
  agentLevel: TrustLevel
  reason?: string
}

export interface VerificationPolicyConfig {
  actionLevels: Record<string, TrustLevel>
}

const DEFAULT_ACTION_LEVELS: Record<string, TrustLevel> = {
  read_only_browse: 0,
  external_api_call: 1,
  payment_authorize: 2,
  wallet_settlement: 3,
  enterprise_sensitive: 4,
}

export class VerificationPolicyEngine {
  private readonly actionLevels: Record<string, TrustLevel>

  constructor(
    private readonly identityService: IAgentIdentityService,
    private readonly mandateService: IMandateService,
    config: Partial<VerificationPolicyConfig> = {},
  ) {
    this.actionLevels = {
      ...DEFAULT_ACTION_LEVELS,
      ...(config.actionLevels ?? {}),
    }
  }

  public async evaluate(
    input: VerificationPolicyInput,
  ): Promise<VerificationPolicyDecision> {
    const requiredLevel = this.getRequiredLevel(input.actionType)
    const identity = await this.identityService.get(input.agentId)

    if (!identity) {
      return blockedDecision(requiredLevel, 0, 'identity_not_found')
    }

    if (identity.verificationStatus === 'revoked') {
      return blockedDecision(requiredLevel, 0, 'identity_revoked')
    }

    if (identity.verificationStatus === 'restricted' && requiredLevel > 0) {
      return blockedDecision(requiredLevel, 0, 'identity_restricted')
    }

    const hasMandate = await this.resolveMandateAccess(input)
    const hasWalletBinding = identity.walletBindings.length > 0
    const agentLevel = computeAgentLevel(identity.verificationStatus, hasMandate, hasWalletBinding)

    if (requiredLevel === 0) {
      return { allowed: true, requiredLevel, agentLevel }
    }

    if (requiredLevel >= 1 && identity.verificationStatus !== 'verified') {
      return blockedDecision(requiredLevel, agentLevel, 'verification_required')
    }

    if (requiredLevel >= 2 && !hasMandate) {
      return blockedDecision(requiredLevel, agentLevel, 'active_mandate_required')
    }

    if (requiredLevel >= 3 && !hasWalletBinding) {
      return blockedDecision(requiredLevel, agentLevel, 'wallet_binding_required')
    }

    if (requiredLevel >= 4 && !input.manualApproval) {
      return blockedDecision(requiredLevel, agentLevel, 'manual_approval_required')
    }

    return { allowed: true, requiredLevel, agentLevel }
  }

  private getRequiredLevel(actionType: string): TrustLevel {
    return this.actionLevels[actionType] ?? 1
  }

  private async resolveMandateAccess(input: VerificationPolicyInput): Promise<boolean> {
    if (input.mandateId) {
      const validation = await this.mandateService.validate(input.mandateId, {})
      return validation.valid
    }

    const mandates = await this.mandateService.listByAgent(input.agentId)
    for (const mandate of mandates) {
      const validation = await this.mandateService.validate(mandate.mandateId, {})
      if (validation.valid) {
        return true
      }
    }

    return false
  }
}

function blockedDecision(
  requiredLevel: TrustLevel,
  agentLevel: TrustLevel,
  reason: string,
): VerificationPolicyDecision {
  return {
    allowed: false,
    requiredLevel,
    agentLevel,
    reason,
  }
}

function computeAgentLevel(
  status: 'unverified' | 'verified' | 'restricted' | 'revoked',
  hasMandate: boolean,
  hasWalletBinding: boolean,
): TrustLevel {
  if (status !== 'verified') {
    return 0
  }

  if (!hasMandate) {
    return 1
  }

  if (!hasWalletBinding) {
    return 2
  }

  return 3
}
