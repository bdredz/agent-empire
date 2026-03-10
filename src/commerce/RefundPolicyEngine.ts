export type RefundDecision = 'auto_refund' | 'auto_credit' | 'manual_review'

export interface RefundDecisionResult {
  decision: RefundDecision
  reason: string
}

export interface RefundPolicyInput {
  amount: number
  purchaseTimestamp: string
  reputationScore: number
  disputeCount: number
}

export interface RefundPolicyConfig {
  lowAmountThreshold: number
  highAmountThreshold: number
  maxDaysForAutoRefund: number
  reputationLowRiskMin: number
  reputationMediumRiskMin: number
  disputeLowRiskMax: number
  disputeMediumRiskMax: number
}

export interface RefundPolicyEngineOptions {
  now: () => Date
  config: Partial<RefundPolicyConfig>
}

const DEFAULT_CONFIG: RefundPolicyConfig = {
  lowAmountThreshold: 100,
  highAmountThreshold: 1000,
  maxDaysForAutoRefund: 14,
  reputationLowRiskMin: 75,
  reputationMediumRiskMin: 50,
  disputeLowRiskMax: 0,
  disputeMediumRiskMax: 2,
}

export class RefundPolicyEngine {
  private readonly now: () => Date
  private readonly config: RefundPolicyConfig

  constructor(options: Partial<RefundPolicyEngineOptions> = {}) {
    this.now = options.now ?? (() => new Date())
    this.config = { ...DEFAULT_CONFIG, ...(options.config ?? {}) }
  }

  public evaluate(input: RefundPolicyInput): RefundDecisionResult {
    this.validate(input)

    const daysSincePurchase = this.getDaysSincePurchase(input.purchaseTimestamp)
    const isLowRisk = this.isLowRisk(input, daysSincePurchase)
    if (isLowRisk) {
      return {
        decision: 'auto_refund',
        reason: 'Low risk profile and low amount within refund window',
      }
    }

    const isHighRisk = this.isHighRisk(input, daysSincePurchase)
    if (isHighRisk) {
      return {
        decision: 'manual_review',
        reason: 'High risk profile requires manual review',
      }
    }

    return {
      decision: 'auto_credit',
      reason: 'Medium risk profile defaults to account credit',
    }
  }

  private isLowRisk(input: RefundPolicyInput, daysSincePurchase: number): boolean {
    return (
      input.amount < this.config.lowAmountThreshold
      && daysSincePurchase <= this.config.maxDaysForAutoRefund
      && input.reputationScore >= this.config.reputationLowRiskMin
      && input.disputeCount <= this.config.disputeLowRiskMax
    )
  }

  private isHighRisk(input: RefundPolicyInput, daysSincePurchase: number): boolean {
    return (
      input.amount > this.config.highAmountThreshold
      || daysSincePurchase > this.config.maxDaysForAutoRefund * 2
      || input.reputationScore < this.config.reputationMediumRiskMin
      || input.disputeCount > this.config.disputeMediumRiskMax
    )
  }

  private getDaysSincePurchase(purchaseTimestamp: string): number {
    const purchasedAt = Date.parse(purchaseTimestamp)
    if (Number.isNaN(purchasedAt)) {
      throw new Error('Invalid purchase timestamp')
    }

    const deltaMs = this.now().getTime() - purchasedAt
    if (deltaMs < 0) {
      return 0
    }

    return deltaMs / 86_400_000
  }

  private validate(input: RefundPolicyInput): void {
    if (input.amount <= 0) {
      throw new Error('Amount must be positive')
    }
    if (input.reputationScore < 0 || input.reputationScore > 100) {
      throw new Error('Reputation score must be between 0 and 100')
    }
    if (input.disputeCount < 0) {
      throw new Error('Dispute count cannot be negative')
    }
  }
}
