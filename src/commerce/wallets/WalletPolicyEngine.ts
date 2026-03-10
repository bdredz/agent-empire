import { WalletPolicy } from '@shared/types'

export interface WalletTransaction {
  amount: number
  asset: string
  merchant?: string
  category?: string
}

export interface WalletPolicyDecision {
  allowed: boolean
  reason?: string
}

export interface WalletPolicyEngineOptions {
  now?: () => Date
}

export class WalletPolicyEngine {
  private readonly policies = new Map<string, WalletPolicy>()
  private readonly frozenWalletIds = new Set<string>()
  private readonly sessionOutflow = new Map<string, number>()
  private readonly dailyOutflow = new Map<string, number>()
  private readonly now: () => Date

  constructor(options: Partial<WalletPolicyEngineOptions> = {}) {
    this.now = options.now ?? (() => new Date())
  }

  public upsertPolicy(policy: WalletPolicy): void {
    this.policies.set(policy.walletId, clonePolicy(policy))
  }

  public evaluate(
    walletId: string,
    transaction: WalletTransaction,
  ): WalletPolicyDecision {
    if (this.frozenWalletIds.has(walletId)) {
      return { allowed: false, reason: 'wallet_frozen' }
    }

    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
      return { allowed: false, reason: 'invalid_amount' }
    }

    const policy = this.policies.get(walletId)
    if (!policy) {
      return { allowed: false, reason: 'wallet_policy_not_found' }
    }

    const normalizedAsset = transaction.asset.toUpperCase()
    if (!policy.allowedAssets.map((asset) => asset.toUpperCase()).includes(normalizedAsset)) {
      return { allowed: false, reason: 'asset_not_allowed' }
    }

    if (!isAllowedByList(policy.allowedMerchants, transaction.merchant)) {
      return { allowed: false, reason: 'merchant_not_allowed' }
    }

    if (!isAllowedByList(policy.allowedCategories, transaction.category)) {
      return { allowed: false, reason: 'category_not_allowed' }
    }

    if (policy.maxPerTransaction !== undefined && transaction.amount > policy.maxPerTransaction) {
      return { allowed: false, reason: 'max_per_transaction_exceeded' }
    }

    const projectedSessionOutflow = this.getSessionOutflow(walletId) + transaction.amount
    if (policy.maxPerSession !== undefined && projectedSessionOutflow > policy.maxPerSession) {
      return { allowed: false, reason: 'max_per_session_exceeded' }
    }

    const projectedDailyOutflow = this.getDailyOutflow(walletId) + transaction.amount
    if (policy.maxDailyOutflow !== undefined && projectedDailyOutflow > policy.maxDailyOutflow) {
      return { allowed: false, reason: 'max_daily_outflow_exceeded' }
    }

    if (
      policy.requiresManualApprovalAbove !== undefined
      && transaction.amount > policy.requiresManualApprovalAbove
    ) {
      return { allowed: false, reason: 'manual_approval_required' }
    }

    this.sessionOutflow.set(walletId, projectedSessionOutflow)
    this.dailyOutflow.set(this.getDailyKey(walletId), projectedDailyOutflow)

    return { allowed: true }
  }

  public freeze(walletId: string): void {
    this.frozenWalletIds.add(walletId)
  }

  public unfreeze(walletId: string): void {
    this.frozenWalletIds.delete(walletId)
  }

  public resetSession(walletId: string): void {
    this.sessionOutflow.delete(walletId)
  }

  private getSessionOutflow(walletId: string): number {
    return this.sessionOutflow.get(walletId) ?? 0
  }

  private getDailyOutflow(walletId: string): number {
    return this.dailyOutflow.get(this.getDailyKey(walletId)) ?? 0
  }

  private getDailyKey(walletId: string): string {
    return `${walletId}:${this.now().toISOString().slice(0, 10)}`
  }
}

function isAllowedByList(
  allowedValues: string[] | undefined,
  value: string | undefined,
): boolean {
  if (!allowedValues || allowedValues.length === 0) {
    return true
  }
  if (!value) {
    return false
  }
  return allowedValues.includes(value)
}

function clonePolicy(policy: WalletPolicy): WalletPolicy {
  return {
    ...policy,
    allowedAssets: [...policy.allowedAssets],
    allowedMerchants: policy.allowedMerchants
      ? [...policy.allowedMerchants]
      : undefined,
    allowedCategories: policy.allowedCategories
      ? [...policy.allowedCategories]
      : undefined,
  }
}
