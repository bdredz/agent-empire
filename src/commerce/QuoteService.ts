import { nanoid } from 'nanoid'
import { CommerceQuote, QuoteId, createQuoteId } from '@shared/types'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry'

const CURRENCY_PATTERN = /^[A-Z]{3}$/

export interface CreateQuoteParams
  extends Omit<CommerceQuote, 'quoteId' | 'createdAt' | 'expiresAt'> {
  expiresAt?: string
}

export interface QuoteServiceOptions {
  now: () => Date
  defaultExpiryMs: number
}

export class QuoteService {
  private readonly quotes = new Map<string, CommerceQuote>()
  private readonly now: () => Date
  private readonly defaultExpiryMs: number

  constructor(
    private readonly counterpartyRegistry: CounterpartyRegistry,
    options: Partial<QuoteServiceOptions> = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.defaultExpiryMs = options.defaultExpiryMs ?? 15 * 60 * 1000
  }

  public async create(params: CreateQuoteParams): Promise<CommerceQuote> {
    await this.assertCounterpartyAllowed(params.tenantId, params.counterpartyId)
    this.validateLineItems(params.lineItems, params.currency)
    this.validateQuoteTotals(params)

    const createdAt = this.now().toISOString()
    const quote: CommerceQuote = {
      ...params,
      quoteId: createQuoteId(`quote_${nanoid()}`),
      createdAt,
      expiresAt: params.expiresAt ?? this.getDefaultExpiryIso(),
      lineItems: params.lineItems.map(cloneLineItem),
    }

    this.assertNotExpired(quote.expiresAt)
    this.quotes.set(this.key(params.tenantId, quote.quoteId), quote)
    return cloneQuote(quote)
  }

  public async get(tenantId: string, quoteId: QuoteId): Promise<CommerceQuote | null> {
    const quote = this.quotes.get(this.key(tenantId, quoteId))
    if (!quote) {
      return null
    }

    this.assertNotExpired(quote.expiresAt)
    return cloneQuote(quote)
  }

  public async listByTenant(tenantId: string): Promise<CommerceQuote[]> {
    return Array.from(this.quotes.values())
      .filter((quote) => quote.tenantId === tenantId)
      .filter((quote) => !this.isExpired(quote.expiresAt))
      .map(cloneQuote)
  }

  private async assertCounterpartyAllowed(
    tenantId: string,
    counterpartyId: CommerceQuote['counterpartyId'],
  ): Promise<void> {
    const counterparty = await this.counterpartyRegistry.get(tenantId, counterpartyId)
    if (!counterparty) {
      throw new Error(`Counterparty not found: ${counterpartyId}`)
    }

    if (counterparty.trustStatus === 'blocked') {
      throw new Error(`Counterparty is blocked: ${counterpartyId}`)
    }
  }

  private validateLineItems(
    lineItems: CommerceQuote['lineItems'],
    quoteCurrency: string,
  ): void {
    if (!CURRENCY_PATTERN.test(quoteCurrency)) {
      throw new Error(`Invalid quote currency: ${quoteCurrency}`)
    }

    if (lineItems.length === 0) {
      throw new Error('Quote must contain at least one line item')
    }

    for (const lineItem of lineItems) {
      if (lineItem.amount <= 0) {
        throw new Error('Line item amount must be positive')
      }
      if (lineItem.quantity <= 0) {
        throw new Error('Line item quantity must be positive')
      }
      if (!CURRENCY_PATTERN.test(lineItem.currency)) {
        throw new Error(`Invalid line item currency: ${lineItem.currency}`)
      }
      if (lineItem.currency !== quoteCurrency) {
        throw new Error('Line item currency must match quote currency')
      }
    }
  }

  private validateQuoteTotals(params: CreateQuoteParams): void {
    const computedTotal = params.lineItems.reduce(
      (sum, lineItem) => sum + lineItem.amount * lineItem.quantity,
      0,
    )

    if (params.totalAmount <= 0) {
      throw new Error('Total amount must be positive')
    }
    if (Number(computedTotal.toFixed(2)) !== Number(params.totalAmount.toFixed(2))) {
      throw new Error('Total amount does not match line items')
    }
  }

  private getDefaultExpiryIso(): string {
    return new Date(this.now().getTime() + this.defaultExpiryMs).toISOString()
  }

  private assertNotExpired(expiresAt: string): void {
    if (this.isExpired(expiresAt)) {
      throw new Error('Quote has expired')
    }
  }

  private isExpired(expiresAt: string): boolean {
    return Date.parse(expiresAt) <= this.now().getTime()
  }

  private key(tenantId: string, quoteId: QuoteId): string {
    return `${tenantId}:${quoteId}`
  }
}

function cloneQuote(quote: CommerceQuote): CommerceQuote {
  return {
    ...quote,
    lineItems: quote.lineItems.map(cloneLineItem),
  }
}

function cloneLineItem(lineItem: CommerceQuote['lineItems'][number]) {
  return { ...lineItem }
}
