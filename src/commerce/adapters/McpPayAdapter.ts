import { nanoid } from 'nanoid'
import { CommerceQuote, Mandate } from '@shared/types'
import {
  ICommerceRailAdapter,
  RailAuthorizeResult,
  RailCaptureResult,
  RailRefundResult,
  RailSettlementStatus,
} from '../ICommerceRailAdapter'

export type McpBillingMode = 'per_call' | 'per_session'

interface McpAuthorization {
  status: RailAuthorizeResult['status']
  billingMode: McpBillingMode
}

interface McpSettlement {
  status: 'settled' | 'refunded'
  settledAt: string
}

export interface McpPayAdapterOptions {
  challengeAmountThreshold?: number
  now?: () => Date
  idFactory?: () => string
}

export class McpPayAdapter implements ICommerceRailAdapter {
  public readonly rail = 'mcp_pay' as const

  private readonly authorizations = new Map<string, McpAuthorization>()
  private readonly settlements = new Map<string, McpSettlement>()
  private readonly challengeAmountThreshold: number
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(options: Partial<McpPayAdapterOptions> = {}) {
    this.challengeAmountThreshold = options.challengeAmountThreshold ?? 200
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => nanoid())
  }

  public async authorize(
    quote: CommerceQuote,
    _mandate?: Mandate,
  ): Promise<RailAuthorizeResult> {
    const billingMode = this.detectBillingMode(quote)
    const computedTotal = this.computeLineItemTotal(quote)

    let status: RailAuthorizeResult['status'] = 'authorized'
    if (!this.isEquivalentTotal(quote.totalAmount, computedTotal)) {
      status = 'denied'
    }
    if (billingMode === 'per_session' && quote.lineItems.some((lineItem) => lineItem.quantity !== 1)) {
      status = 'denied'
    }
    if (quote.totalAmount > this.challengeAmountThreshold && status === 'authorized') {
      status = 'challenged'
    }

    const externalId = `mcp_${this.idFactory()}`
    this.authorizations.set(externalId, { status, billingMode })
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
      throw new Error(`Unknown mcp_pay authorization: ${externalId}`)
    }

    const externalTransactionId = `mcp_${this.idFactory()}`
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

  public getBillingMode(externalId: string): McpBillingMode | undefined {
    return this.authorizations.get(externalId)?.billingMode
  }

  private detectBillingMode(quote: CommerceQuote): McpBillingMode {
    const hasSessionLineItem = quote.lineItems.some((lineItem) =>
      lineItem.description.toLowerCase().includes('session'),
    )
    return hasSessionLineItem ? 'per_session' : 'per_call'
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

  private isEquivalentTotal(expected: number, actual: number): boolean {
    return Math.abs(expected - actual) < 0.000001
  }

  private assertPositiveAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }
  }
}
