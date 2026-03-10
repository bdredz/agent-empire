import { describe, expect, it } from 'vitest'
import { WalletPolicy, createWalletPolicyId } from '@shared/types'
import { WalletPolicyEngine } from '../wallets/WalletPolicyEngine'
import { TreasuryLedger } from './TreasuryLedger'
import { TreasuryService } from './TreasuryService'

const FIXED_NOW = new Date('2026-03-10T12:00:00.000Z')

const buildWalletPolicy = (): WalletPolicy => ({
  walletPolicyId: createWalletPolicyId('policy-wallet-1'),
  tenantId: 'tenant-1',
  walletId: 'wallet-1',
  maxPerTransaction: 1000,
  maxPerSession: 5000,
  maxDailyOutflow: 5000,
  allowedAssets: ['USDC'],
})

const setupService = () => {
  const walletPolicyEngine = new WalletPolicyEngine({ now: () => FIXED_NOW })
  walletPolicyEngine.upsertPolicy(buildWalletPolicy())

  const treasuryLedger = new TreasuryLedger({
    now: () => FIXED_NOW,
    idFactory: (() => {
      let current = 0
      return () => `${++current}`.padStart(3, '0')
    })(),
  })

  const treasuryService = new TreasuryService(
    walletPolicyEngine,
    treasuryLedger,
    {
      defaultTenantId: 'tenant-1',
      now: () => FIXED_NOW,
    },
  )

  treasuryService.registerWallet('wallet-1', 'tenant-1')
  treasuryService.registerWallet('wallet-2', 'tenant-1')

  return { treasuryService, treasuryLedger }
}

describe('TreasuryService', () => {
  it('returns wallet balance', () => {
    const { treasuryService } = setupService()

    expect(treasuryService.getBalance('wallet-1')).toMatchObject({
      walletId: 'wallet-1',
      tenantId: 'tenant-1',
      available: 0,
      held: 0,
    })
  })

  it('holds balance by moving available to held', () => {
    const { treasuryService } = setupService()

    treasuryService.credit('wallet-1', 100, 'USDC')
    treasuryService.hold('wallet-1', 40, 'USDC')

    expect(treasuryService.getBalance('wallet-1')).toMatchObject({
      available: 60,
      held: 40,
      asset: 'USDC',
    })
  })

  it('releases held balance back to available', () => {
    const { treasuryService } = setupService()

    treasuryService.credit('wallet-1', 80, 'USDC')
    treasuryService.hold('wallet-1', 30, 'USDC')
    treasuryService.release('wallet-1', 10, 'USDC')

    expect(treasuryService.getBalance('wallet-1')).toMatchObject({
      available: 60,
      held: 20,
    })
  })

  it('debits from held balance', () => {
    const { treasuryService } = setupService()

    treasuryService.credit('wallet-1', 75, 'USDC')
    treasuryService.hold('wallet-1', 30, 'USDC')
    treasuryService.debit('wallet-1', 20, 'USDC')

    expect(treasuryService.getBalance('wallet-1')).toMatchObject({
      available: 45,
      held: 10,
    })
  })

  it('credits available balance', () => {
    const { treasuryService } = setupService()

    treasuryService.credit('wallet-1', 55, 'USDC')

    expect(treasuryService.getBalance('wallet-1')).toMatchObject({
      available: 55,
      held: 0,
    })
  })

  it('rejects hold when available balance is insufficient', () => {
    const { treasuryService } = setupService()

    treasuryService.credit('wallet-1', 10, 'USDC')

    expect(() => treasuryService.hold('wallet-1', 20, 'USDC')).toThrow(
      'Insufficient available balance',
    )
  })

  it('rejects release when held balance is insufficient', () => {
    const { treasuryService } = setupService()

    expect(() => treasuryService.release('wallet-1', 5, 'USDC')).toThrow(
      'Insufficient held balance',
    )
  })

  it('rejects debit when held balance is insufficient', () => {
    const { treasuryService } = setupService()

    expect(() => treasuryService.debit('wallet-1', 5, 'USDC')).toThrow(
      'Insufficient held balance',
    )
  })

  it('sweeps all available balance between wallets', () => {
    const { treasuryService } = setupService()

    treasuryService.credit('wallet-1', 100, 'USDC')
    treasuryService.sweep('wallet-1', 'wallet-2', 'USDC')

    expect(treasuryService.getBalance('wallet-1')).toMatchObject({ available: 0 })
    expect(treasuryService.getBalance('wallet-2')).toMatchObject({ available: 100 })
  })

  it('creates ledger entries for treasury operations', () => {
    const { treasuryService, treasuryLedger } = setupService()

    treasuryService.credit('wallet-1', 100, 'USDC')
    treasuryService.hold('wallet-1', 25, 'USDC')
    treasuryService.debit('wallet-1', 10, 'USDC')

    const entries = treasuryLedger.query({ walletId: 'wallet-1' })
    expect(entries.length).toBe(3)
    expect(entries.map((entry) => entry.operation)).toEqual([
      'credit',
      'hold',
      'debit',
    ])
  })
})
