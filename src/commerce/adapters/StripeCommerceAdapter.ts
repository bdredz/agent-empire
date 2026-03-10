import { nanoid } from 'nanoid'
import { CommerceQuote, Mandate } from '@shared/types'
import {
  ICommerceRailAdapter,
  RailAuthorizeResult,
  RailCaptureResult,
  RailRefundResult,
  RailSettlementStatus,
} from '../ICommerceRailAdapter'

interface StripeAuthorization {
  status: RailAuthorizeResult['status']
}

interface StripeSettlement {
  status: 'settled' | 'refunded'
  settledAt: string
}

export interface StripeCommerceAdapterOptions {
  challengeAmountThreshold?: number
  supportedCurrencies?: string[]
  now?: () => Date
  idFactory?: () => string
}

export class StripeCommerceAdapter implements ICommerceRailAdapter {
  public readonly rail = 'stripe' as const

  private readonly authorizations = new Map<string, StripeAuthorization>()
  private readonly settlements = new Map<string, StripeSettlement>()
  private readonly supportedCurrencies: Set<string>
  private readonly challengeAmountThreshold: number
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(options: Partial<StripeCommerceAdapterOptions> = {}) {
    this.supportedCurrencies = new Set(
      (options.supportedCurrencies ?? ['USD', 'EUR', 'GBP']).map((currency) =>
        currency.toUpperCase(),
      ),
    )
    this.challengeAmountThreshold = options.challengeAmountThreshold ?? 10000
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => nanoid())
  }

  public async authorize(
    quote: CommerceQuote,
    _mandate?: Mandate,
  ): Promise<RailAuthorizeResult> {
    this.assertPositiveAmount(quote.totalAmount)
    this.assertSupportedCurrency(quote.currency)

    const externalId = `pi_test_${this.idFactory()}`
    const status: RailAuthorizeResult['status'] =
      quote.totalAmount > this.challengeAmountThreshold
        ? 'challenged'
        : 'authorized'

    this.authorizations.set(externalId, { status })
    return { externalId, status }
  }

  public async capture(
    externalId: string,
    amount: number,
    currency: string,
  ): Promise<RailCaptureResult> {
    this.assertPositiveAmount(amount)
    this.assertSupportedCurrency(currency)

    const authorization = this.authorizations.get(externalId)
    if (!authorization) {
      throw new Error(`Unknown stripe authorization: ${externalId}`)
    }

    const externalTransactionId = `pi_test_${this.idFactory()}`
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

  private assertPositiveAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }
  }

  private assertSupportedCurrency(currency: string): void {
    const normalized = currency.toUpperCase()
    if (!this.supportedCurrencies.has(normalized)) {
      throw new Error(`Unsupported currency: ${currency}`)
    }
  }
}
