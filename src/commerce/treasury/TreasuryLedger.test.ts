import { describe, expect, it } from 'vitest'
import { TreasuryLedger } from './TreasuryLedger'

const createIdFactory = () => {
  let current = 0
  return () => `${++current}`.padStart(3, '0')
}

describe('TreasuryLedger', () => {
  it('appends ledger entries', () => {
    const ledger = new TreasuryLedger({ idFactory: createIdFactory() })

    const entry = ledger.append({
      walletId: 'wallet-1',
      tenantId: 'tenant-1',
      operation: 'credit',
      amount: 100,
      asset: 'USDC',
      balanceBefore: { available: 0, held: 0 },
      balanceAfter: { available: 100, held: 0 },
    })

    expect(entry.entryId).toBe('treasury_ledger_001')
    expect(entry.operation).toBe('credit')
  })

  it('queries entries by wallet', () => {
    const ledger = new TreasuryLedger({ idFactory: createIdFactory() })
    appendSampleEntries(ledger)

    const entries = ledger.query({ walletId: 'wallet-1' })
    expect(entries).toHaveLength(2)
    expect(entries.every((entry) => entry.walletId === 'wallet-1')).toBe(true)
  })

  it('queries entries by tenant', () => {
    const ledger = new TreasuryLedger({ idFactory: createIdFactory() })
    appendSampleEntries(ledger)

    const entries = ledger.query({ tenantId: 'tenant-2' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.walletId).toBe('wallet-2')
  })

  it('queries entries by operation type', () => {
    const ledger = new TreasuryLedger({ idFactory: createIdFactory() })
    appendSampleEntries(ledger)

    const entries = ledger.query({ operation: 'hold' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.amount).toBe(10)
  })

  it('queries entries by time range', () => {
    const ledger = new TreasuryLedger({ idFactory: createIdFactory() })
    appendSampleEntries(ledger)

    const entries = ledger.query({
      fromTimestamp: '2026-03-10T12:00:01.000Z',
      toTimestamp: '2026-03-10T12:00:03.000Z',
    })

    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.operation)).toEqual(['hold', 'credit'])
  })

  it('returns immutable entry snapshots', () => {
    const ledger = new TreasuryLedger({ idFactory: createIdFactory() })
    appendSampleEntries(ledger)

    const firstQuery = ledger.query({ walletId: 'wallet-1' })
    firstQuery[0]!.balanceAfter.available = 9999

    const secondQuery = ledger.query({ walletId: 'wallet-1' })
    expect(secondQuery[0]!.balanceAfter.available).not.toBe(9999)
  })
})

function appendSampleEntries(ledger: TreasuryLedger): void {
  ledger.append({
    walletId: 'wallet-1',
    tenantId: 'tenant-1',
    operation: 'credit',
    amount: 100,
    asset: 'USDC',
    balanceBefore: { available: 0, held: 0 },
    balanceAfter: { available: 100, held: 0 },
    timestamp: '2026-03-10T12:00:00.000Z',
  })

  ledger.append({
    walletId: 'wallet-1',
    tenantId: 'tenant-1',
    operation: 'hold',
    amount: 10,
    asset: 'USDC',
    balanceBefore: { available: 100, held: 0 },
    balanceAfter: { available: 90, held: 10 },
    timestamp: '2026-03-10T12:00:02.000Z',
  })

  ledger.append({
    walletId: 'wallet-2',
    tenantId: 'tenant-2',
    operation: 'credit',
    amount: 50,
    asset: 'USDC',
    balanceBefore: { available: 0, held: 0 },
    balanceAfter: { available: 50, held: 0 },
    timestamp: '2026-03-10T12:00:03.000Z',
  })
}
