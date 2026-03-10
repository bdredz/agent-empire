import { nanoid } from 'nanoid'
import { CommerceQuote, Mandate } from '@shared/types'
import {
  ICommerceRailAdapter,
  RailAuthorizeResult,
  RailCaptureResult,
  RailRefundResult,
  RailSettlementStatus,
} from '../ICommerceRailAdapter'

export type X402PricingModel = 'per_call' | 'flat'

interface X402Authorization {
  status: RailAuthorizeResult['status']
  pricingModel: X402PricingModel
}

interface X402Settlement {
  status: 'settled' | 'refunded'
  settledAt: string
}

export interface X402AdapterOptions {
  challengeAmountThreshold?: number
  now?: () => Date
  idFactory?: () => string
}

export class X402Adapter implements ICommerceRailAdapter {
  public readonly rail = 'x402' as const

  private readonly authorizations = new Map<string, X402Authorization>()
  private readonly settlements = new Map<string, X402Settlement>()
  private readonly challengeAmountThreshold: number
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(options: Partial<X402AdapterOptions> = {}) {
    this.challengeAmountThreshold = options.challengeAmountThreshold ?? 500
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => nanoid())
  }

  public async authorize(
    quote: CommerceQuote,
    _mandate?: Mandate,
  ): Promise<RailAuthorizeResult> {
    const computedTotal = this.computeLineItemTotal(quote)
    if (!this.isEquivalentTotal(quote.totalAmount, computedTotal)) {
      const deniedId = `x402_${this.idFactory()}`
      this.authorizations.set(deniedId, { status: 'denied', pricingModel: 'flat' })
      return { externalId: deniedId, status: 'denied' }
    }

    const status: RailAuthorizeResult['status'] =
      quote.totalAmount > this.challengeAmountThreshold
        ? 'challenged'
        : 'authorized'

    const pricingModel = this.detectPricingModel(quote)
    const externalId = `x402_${this.idFactory()}`
    this.authorizations.set(externalId, { status, pricingModel })

    return { externalId, status }
  }

  public async capture(
    externalId: string,
    amount: number,
    _currency: string,
  ): Promise<RailCaptureResult> {
    this.assertPositiveAmount(amount)
    const authorization = this.authorizations.get(externalId)
    if (!authorization) {
      throw new Error(`Unknown x402 authorization: ${externalId}`)
    }

    const externalTransactionId = `x402_${this.idFactory()}`
    if (authorization.status !== 'authorized') {
      return { externalTransactionId, status: 'failed' }
    }

    this.settlements.set(externalTransactionId, {
      status: 'settled',
      settledAt: this.now().toISOString(),
    })

    return { externalTransactionId, status: 'settled' }
  }

  public async refund(
    externalTransactionId: string,
    amount: number,
  ): Promise<RailRefundResult> {
    this.assertPositiveAmount(amount)
    const settlement = this.settlements.get(externalTransactionId)
    if (!settlement || settlement.status !== 'settled') {
      return { status: 'failed' }
    }

    this.settlements.set(externalTransactionId, {
      status: 'refunded',
      settledAt: settlement.settledAt,
    })

    return { status: 'refunded' }
  }

  public async getSettlementStatus(
    externalTransactionId: string,
  ): Promise<RailSettlementStatus> {
    const settlement = this.settlements.get(externalTransactionId)
    if (!settlement) {
      return { status: 'pending' }
    }

    return {
      status: settlement.status,
      settledAt: settlement.settledAt,
    }
  }

  public getPricingModel(externalId: string): X402PricingModel | undefined {
    return this.authorizations.get(externalId)?.pricingModel
  }

  private detectPricingModel(quote: CommerceQuote): X402PricingModel {
    const hasPerCallLineItem = quote.lineItems.some((lineItem) =>
      lineItem.description.toLowerCase().includes('call'),
    )
    return hasPerCallLineItem ? 'per_call' : 'flat'
  }

  private computeLineItemTotal(quote: CommerceQuote): number {
    return quote.lineItems.reduce((total, lineItem) => {
      this.assertPositiveAmount(lineItem.amount)
      if (!Number.isFinite(lineItem.quantity) || lineItem.quantity <= 0) {
        throw new Error('Line item quantity must be greater than 0')
      }
      return total + lineItem.amount * lineItem.quantity
    }, 0)
  }

  private assertPositiveAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }
  }

  private isEquivalentTotal(expected: number, actual: number): boolean {
    return Math.abs(expected - actual) < 0.000001
  }
}
