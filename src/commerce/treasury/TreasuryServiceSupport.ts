import { TreasuryBalanceSnapshot } from './TreasuryLedger'

export interface WalletAssetBalance extends TreasuryBalanceSnapshot {
  updatedAt: string
}

export const assertPositiveAmount = (amount: number): void => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }
}

export const cloneSnapshot = (
  balance: TreasuryBalanceSnapshot,
): TreasuryBalanceSnapshot => ({
  available: balance.available,
  held: balance.held,
})

export const getAssetBalance = (
  walletBalances: Map<string, Map<string, WalletAssetBalance>>,
  walletId: string,
  asset: string,
  now: () => Date,
): WalletAssetBalance => {
  const normalizedAsset = asset.toUpperCase()

  const balancesByAsset =
    walletBalances.get(walletId) ?? new Map<string, WalletAssetBalance>()
  walletBalances.set(walletId, balancesByAsset)

  let balance = balancesByAsset.get(normalizedAsset)
  if (!balance) {
    balance = {
      available: 0,
      held: 0,
      updatedAt: now().toISOString(),
    }
    balancesByAsset.set(normalizedAsset, balance)
  }

  return balance
}

export const resolveTenant = (
  walletTenants: Map<string, string>,
  walletId: string,
  defaultTenantId: string,
): string => {
  const existing = walletTenants.get(walletId)
  if (existing) {
    return existing
  }

  walletTenants.set(walletId, defaultTenantId)
  return defaultTenantId
}
