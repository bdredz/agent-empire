import { TreasuryBalance } from '@shared/types'
import { WalletPolicyEngine } from '../wallets/WalletPolicyEngine'
import {
  TreasuryBalanceSnapshot,
  TreasuryLedger,
  TreasuryOperation,
} from './TreasuryLedger'
import {
  WalletAssetBalance,
  assertPositiveAmount,
  cloneSnapshot,
  getAssetBalance,
  resolveTenant,
} from './TreasuryServiceSupport'

export interface TreasuryServiceOptions {
  defaultTenantId?: string
  now?: () => Date
}

export class TreasuryService {
  private readonly walletBalances = new Map<string, Map<string, WalletAssetBalance>>()
  private readonly walletTenants = new Map<string, string>()
  private readonly defaultTenantId: string
  private readonly now: () => Date

  constructor(
    private readonly walletPolicyEngine: WalletPolicyEngine,
    private readonly treasuryLedger: TreasuryLedger,
    options: Partial<TreasuryServiceOptions> = {},
  ) {
    this.defaultTenantId = options.defaultTenantId ?? 'tenant-default'
    this.now = options.now ?? (() => new Date())
  }

  public registerWallet(walletId: string, tenantId: string): void {
    this.walletTenants.set(walletId, tenantId)
  }

  public getBalance(walletId: string): TreasuryBalance {
    const balancesByAsset = this.walletBalances.get(walletId)
    if (!balancesByAsset || balancesByAsset.size === 0) {
      return {
        walletId,
        tenantId: resolveTenant(this.walletTenants, walletId, this.defaultTenantId),
        asset: 'USDC',
        available: 0,
        held: 0,
        updatedAt: this.now().toISOString(),
      }
    }

    const [asset, balance] = balancesByAsset.entries().next().value as [
      string,
      WalletAssetBalance,
    ]

    return {
      walletId,
      tenantId: resolveTenant(this.walletTenants, walletId, this.defaultTenantId),
      asset,
      available: balance.available,
      held: balance.held,
      updatedAt: balance.updatedAt,
    }
  }

  public hold(walletId: string, amount: number, asset: string): void {
    assertPositiveAmount(amount)

    const policyDecision = this.walletPolicyEngine.evaluate(walletId, {
      amount,
      asset,
    })
    if (!policyDecision.allowed) {
      throw new Error(policyDecision.reason ?? 'wallet policy rejected hold')
    }

    const balance = getAssetBalance(this.walletBalances, walletId, asset, this.now)
    if (balance.available < amount) {
      throw new Error('Insufficient available balance for hold')
    }

    const before = cloneSnapshot(balance)
    balance.available -= amount
    balance.held += amount
    balance.updatedAt = this.now().toISOString()

    this.appendLedger(walletId, 'hold', amount, asset, before, balance)
  }

  public release(walletId: string, amount: number, asset: string): void {
    assertPositiveAmount(amount)

    const balance = getAssetBalance(this.walletBalances, walletId, asset, this.now)
    if (balance.held < amount) {
      throw new Error('Insufficient held balance for release')
    }

    const before = cloneSnapshot(balance)
    balance.held -= amount
    balance.available += amount
    balance.updatedAt = this.now().toISOString()

    this.appendLedger(walletId, 'release', amount, asset, before, balance)
  }

  public debit(walletId: string, amount: number, asset: string): void {
    assertPositiveAmount(amount)

    const balance = getAssetBalance(this.walletBalances, walletId, asset, this.now)
    if (balance.held < amount) {
      throw new Error('Insufficient held balance for debit')
    }

    const before = cloneSnapshot(balance)
    balance.held -= amount
    balance.updatedAt = this.now().toISOString()

    this.appendLedger(walletId, 'debit', amount, asset, before, balance)
  }

  public credit(walletId: string, amount: number, asset: string): void {
    assertPositiveAmount(amount)

    const balance = getAssetBalance(this.walletBalances, walletId, asset, this.now)
    const before = cloneSnapshot(balance)
    balance.available += amount
    balance.updatedAt = this.now().toISOString()

    this.appendLedger(walletId, 'credit', amount, asset, before, balance)
  }

  public sweep(fromWalletId: string, toWalletId: string, asset: string): void {
    const source = getAssetBalance(this.walletBalances, fromWalletId, asset, this.now)
    const amount = source.available
    if (amount <= 0) {
      return
    }

    const sourceBefore = cloneSnapshot(source)
    source.available = 0
    source.updatedAt = this.now().toISOString()

    const target = getAssetBalance(this.walletBalances, toWalletId, asset, this.now)
    const targetBefore = cloneSnapshot(target)
    target.available += amount
    target.updatedAt = this.now().toISOString()

    this.appendLedger(fromWalletId, 'sweep', amount, asset, sourceBefore, source, {
      direction: 'out',
      counterpartyWalletId: toWalletId,
    })

    this.appendLedger(toWalletId, 'sweep', amount, asset, targetBefore, target, {
      direction: 'in',
      counterpartyWalletId: fromWalletId,
    })
  }

  private appendLedger(
    walletId: string,
    operation: TreasuryOperation,
    amount: number,
    asset: string,
    before: TreasuryBalanceSnapshot,
    after: TreasuryBalanceSnapshot,
    metadata?: Record<string, unknown>,
  ): void {
    this.treasuryLedger.append({
      walletId,
      tenantId: resolveTenant(this.walletTenants, walletId, this.defaultTenantId),
      operation,
      amount,
      asset: asset.toUpperCase(),
      balanceBefore: before,
      balanceAfter: after,
      metadata,
    })
  }
}
