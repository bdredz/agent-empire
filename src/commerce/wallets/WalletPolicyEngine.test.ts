import { describe, expect, it } from 'vitest'
import { WalletPolicy, createWalletPolicyId } from '@shared/types'
import { WalletPolicyEngine } from './WalletPolicyEngine'

const FIXED_NOW = new Date('2026-03-10T12:00:00.000Z')

const buildPolicy = (overrides: Partial<WalletPolicy> = {}): WalletPolicy => ({
  walletPolicyId: createWalletPolicyId('policy-1'),
  tenantId: 'tenant-1',
  walletId: 'wallet-1',
  maxPerTransaction: 100,
  maxPerSession: 250,
  maxDailyOutflow: 300,
  allowedAssets: ['USDC', 'ETH'],
  allowedMerchants: ['merchant-1'],
  allowedCategories: ['infra'],
  requiresManualApprovalAbove: 90,
  ...overrides,
})

describe('WalletPolicyEngine', () => {
  it('allows transactions within policy limits', () => {
    const engine = new WalletPolicyEngine({ now: () => FIXED_NOW })
    engine.upsertPolicy(
      buildPolicy({ requiresManualApprovalAbove: 200 }),
    )

    const decision = engine.evaluate('wallet-1', {
      amount: 50,
      asset: 'USDC',
      merchant: 'merchant-1',
      category: 'infra',
    })

    expect(decision).toEqual({ allowed: true })
  })

  it('rejects transactions over max per transaction', () => {
    const engine = new WalletPolicyEngine({ now: () => FIXED_NOW })
    engine.upsertPolicy(buildPolicy())

    const decision = engine.evaluate('wallet-1', {
      amount: 120,
      asset: 'USDC',
      merchant: 'merchant-1',
      category: 'infra',
    })

    expect(decision).toEqual({
      allowed: false,
      reason: 'max_per_transaction_exceeded',
    })
  })

  it('rejects transactions over max daily outflow', () => {
    const engine = new WalletPolicyEngine({ now: () => FIXED_NOW })
    engine.upsertPolicy(
      buildPolicy({ maxDailyOutflow: 100, requiresManualApprovalAbove: 200 }),
    )

    expect(
      engine.evaluate('wallet-1', {
        amount: 60,
        asset: 'USDC',
        merchant: 'merchant-1',
        category: 'infra',
      }),
    ).toEqual({ allowed: true })

    const decision = engine.evaluate('wallet-1', {
      amount: 50,
      asset: 'USDC',
      merchant: 'merchant-1',
      category: 'infra',
    })

    expect(decision).toEqual({
      allowed: false,
      reason: 'max_daily_outflow_exceeded',
    })
  })

  it('rejects disallowed assets', () => {
    const engine = new WalletPolicyEngine({ now: () => FIXED_NOW })
    engine.upsertPolicy(buildPolicy())

    const decision = engine.evaluate('wallet-1', {
      amount: 20,
      asset: 'BTC',
      merchant: 'merchant-1',
      category: 'infra',
    })

    expect(decision).toEqual({ allowed: false, reason: 'asset_not_allowed' })
  })

  it('rejects disallowed merchants', () => {
    const engine = new WalletPolicyEngine({ now: () => FIXED_NOW })
    engine.upsertPolicy(buildPolicy())

    const decision = engine.evaluate('wallet-1', {
      amount: 20,
      asset: 'USDC',
      merchant: 'merchant-2',
      category: 'infra',
    })

    expect(decision).toEqual({ allowed: false, reason: 'merchant_not_allowed' })
  })

  it('blocks all transactions when frozen', () => {
    const engine = new WalletPolicyEngine({ now: () => FIXED_NOW })
    engine.upsertPolicy(buildPolicy())
    engine.freeze('wallet-1')

    const decision = engine.evaluate('wallet-1', {
      amount: 10,
      asset: 'USDC',
      merchant: 'merchant-1',
      category: 'infra',
    })

    expect(decision).toEqual({ allowed: false, reason: 'wallet_frozen' })
  })

  it('restores transaction flow after unfreeze', () => {
    const engine = new WalletPolicyEngine({ now: () => FIXED_NOW })
    engine.upsertPolicy(buildPolicy({ requiresManualApprovalAbove: 200 }))
    engine.freeze('wallet-1')
    engine.unfreeze('wallet-1')

    const decision = engine.evaluate('wallet-1', {
      amount: 10,
      asset: 'USDC',
      merchant: 'merchant-1',
      category: 'infra',
    })

    expect(decision).toEqual({ allowed: true })
  })

  it('requires manual approval above threshold', () => {
    const engine = new WalletPolicyEngine({ now: () => FIXED_NOW })
    engine.upsertPolicy(buildPolicy())

    const decision = engine.evaluate('wallet-1', {
      amount: 95,
      asset: 'USDC',
      merchant: 'merchant-1',
      category: 'infra',
    })

    expect(decision).toEqual({
      allowed: false,
      reason: 'manual_approval_required',
    })
  })
})
