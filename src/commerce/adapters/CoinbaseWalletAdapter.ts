import { nanoid } from 'nanoid'
import { CommerceQuote, Mandate } from '@shared/types'
import {
  ICommerceRailAdapter,
  RailAuthorizeResult,
  RailCaptureResult,
  RailRefundResult,
  RailSettlementStatus,
} from '../ICommerceRailAdapter'

interface WalletBalance {
  available: number
  held: number
}

interface CoinbaseAuthorization {
  status: RailAuthorizeResult['status']
  asset: string
  amount: number
}

interface CoinbaseSettlement {
  status: 'settled' | 'refunded'
  settledAt: string
  asset: string
  amount: number
}

export interface CoinbaseWalletAdapterOptions {
  supportedAssets?: string[]
  initialBalances?: Record<string, number>
  now?: () => Date
  idFactory?: () => string
}

export class CoinbaseWalletAdapter implements ICommerceRailAdapter {
  public readonly rail = 'coinbase_wallet' as const

  private readonly balances = new Map<string, WalletBalance>()
  private readonly authorizations = new Map<string, CoinbaseAuthorization>()
  private readonly settlements = new Map<string, CoinbaseSettlement>()
  private readonly supportedAssets: Set<string>
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(options: Partial<CoinbaseWalletAdapterOptions> = {}) {
    this.supportedAssets = new Set(
      (options.supportedAssets ?? ['USDC', 'ETH']).map((asset) =>
        asset.toUpperCase(),
      ),
    )
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => nanoid())

    for (const asset of this.supportedAssets) {
      const available = options.initialBalances?.[asset] ?? 0
      this.balances.set(asset, { available, held: 0 })
    }
  }

  public async authorize(
    quote: CommerceQuote,
    _mandate?: Mandate,
  ): Promise<RailAuthorizeResult> {
    this.assertPositiveAmount(quote.totalAmount)
    const asset = this.normalizeAsset(quote.currency)
    const balance = this.requireBalance(asset)

    const externalId = `cb_${this.idFactory()}`
    if (balance.available < quote.totalAmount) {
      this.authorizations.set(externalId, {
        status: 'denied',
        asset,
        amount: quote.totalAmount,
      })
      return { externalId, status: 'denied' }
    }

    balance.held += quote.totalAmount
    this.authorizations.set(externalId, {
      status: 'authorized',
      asset,
      amount: quote.totalAmount,
    })

    return { externalId, status: 'authorized' }
  }

  public async capture(
    externalId: string,
    amount: number,
    currency: string,
  ): Promise<RailCaptureResult> {
    this.assertPositiveAmount(amount)
    const asset = this.normalizeAsset(currency)
    const authorization = this.authorizations.get(externalId)
    if (!authorization) {
      throw new Error(`Unknown coinbase authorization: ${externalId}`)
    }

    const externalTransactionId = `cb_${this.idFactory()}`
    if (authorization.status !== 'authorized' || authorization.asset !== asset) {
      return { externalTransactionId, status: 'failed' }
    }

    const balance = this.requireBalance(asset)
    if (balance.held < amount || balance.available < amount) {
      return { externalTransactionId, status: 'failed' }
    }

    balance.held -= amount
    balance.available -= amount

    this.settlements.set(externalTransactionId, {
      status: 'settled',
      settledAt: this.now().toISOString(),
      asset,
      amount,
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

    const balance = this.requireBalance(settlement.asset)
    balance.available += amount

    this.settlements.set(externalTransactionId, {
      ...settlement,
      status: 'refunded',
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

  public getBalance(asset: string): WalletBalance {
    const normalized = this.normalizeAsset(asset)
    return { ...this.requireBalance(normalized) }
  }

  private normalizeAsset(asset: string): string {
    const normalized = asset.toUpperCase()
    if (!this.supportedAssets.has(normalized)) {
      throw new Error(`Unsupported asset: ${asset}`)
    }
    return normalized
  }

  private requireBalance(asset: string): WalletBalance {
    const balance = this.balances.get(asset)
    if (!balance) {
      throw new Error(`No wallet balance for asset: ${asset}`)
    }
    return balance
  }

  private assertPositiveAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0')
    }
  }
}
