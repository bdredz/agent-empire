import { nanoid } from 'nanoid'

export type TreasuryOperation =
  | 'hold'
  | 'release'
  | 'debit'
  | 'credit'
  | 'sweep'
  | 'freeze'
  | 'unfreeze'

export interface TreasuryBalanceSnapshot {
  available: number
  held: number
}

export interface TreasuryLedgerEntry {
  entryId: string
  walletId: string
  tenantId: string
  operation: TreasuryOperation
  amount: number
  asset: string
  balanceBefore: TreasuryBalanceSnapshot
  balanceAfter: TreasuryBalanceSnapshot
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface TreasuryLedgerQuery {
  walletId?: string
  tenantId?: string
  operation?: TreasuryOperation
  fromTimestamp?: string
  toTimestamp?: string
}

export interface TreasuryLedgerOptions {
  now?: () => Date
  idFactory?: () => string
}

export class TreasuryLedger {
  private readonly entries: TreasuryLedgerEntry[] = []
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(options: Partial<TreasuryLedgerOptions> = {}) {
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => nanoid())
  }

  public append(
    entry: Omit<TreasuryLedgerEntry, 'entryId' | 'timestamp'>
    & { timestamp?: string },
  ): TreasuryLedgerEntry {
    if (!Number.isFinite(entry.amount) || entry.amount < 0) {
      throw new Error('Ledger amount must be non-negative')
    }

    const timestamp = entry.timestamp ?? this.now().toISOString()
    const stored: TreasuryLedgerEntry = {
      ...entry,
      entryId: `treasury_ledger_${this.idFactory()}`,
      timestamp,
      balanceBefore: { ...entry.balanceBefore },
      balanceAfter: { ...entry.balanceAfter },
      metadata: entry.metadata ? { ...entry.metadata } : undefined,
    }

    this.entries.push(stored)
    return cloneLedgerEntry(stored)
  }

  public query(filters: TreasuryLedgerQuery = {}): TreasuryLedgerEntry[] {
    return this.entries
      .filter((entry) => {
        if (filters.walletId && entry.walletId !== filters.walletId) {
          return false
        }
        if (filters.tenantId && entry.tenantId !== filters.tenantId) {
          return false
        }
        if (filters.operation && entry.operation !== filters.operation) {
          return false
        }
        if (!isInRange(entry.timestamp, filters.fromTimestamp, filters.toTimestamp)) {
          return false
        }
        return true
      })
      .map(cloneLedgerEntry)
  }
}

function isInRange(
  timestamp: string,
  fromTimestamp?: string,
  toTimestamp?: string,
): boolean {
  const value = Date.parse(timestamp)
  if (Number.isNaN(value)) {
    return false
  }

  if (fromTimestamp) {
    const from = Date.parse(fromTimestamp)
    if (!Number.isNaN(from) && value < from) {
      return false
    }
  }

  if (toTimestamp) {
    const to = Date.parse(toTimestamp)
    if (!Number.isNaN(to) && value > to) {
      return false
    }
  }

  return true
}

function cloneLedgerEntry(entry: TreasuryLedgerEntry): TreasuryLedgerEntry {
  return {
    ...entry,
    balanceBefore: { ...entry.balanceBefore },
    balanceAfter: { ...entry.balanceAfter },
    metadata: entry.metadata ? { ...entry.metadata } : undefined,
  }
}
