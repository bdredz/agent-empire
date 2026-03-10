import { describe, expect, it } from 'vitest'
import {
  CommerceQuote,
  createCounterpartyId,
  createQuoteId,
} from '@shared/types'
import { CoinbaseWalletAdapter } from './CoinbaseWalletAdapter'

const createIdFactory = () => {
  let current = 0
  return () => `${++current}`.padStart(3, '0')
}

const FIXED_TIME = new Date('2026-03-10T12:00:00.000Z')

const buildQuote = (amount: number, asset = 'USDC'): CommerceQuote => ({
  quoteId: createQuoteId('quote-coinbase'),
  tenantId: 'tenant-1',
  counterpartyId: createCounterpartyId('counterparty-1'),
  lineItems: [{ description: 'Wallet spend', amount, currency: asset, quantity: 1 }],
  totalAmount: amount,
  currency: asset,
  expiresAt: '2026-03-10T13:00:00.000Z',
  createdAt: '2026-03-10T11:00:00.000Z',
})

describe('CoinbaseWalletAdapter', () => {
  it('authorizes when wallet balance is sufficient', async () => {
    const adapter = new CoinbaseWalletAdapter({
      initialBalances: { USDC: 100 },
      idFactory: createIdFactory(),
    })

    const result = await adapter.authorize(buildQuote(25, 'USDC'))
    expect(result.status).toBe('authorized')
    expect(result.externalId).toMatch(/^cb_/) 
  })

  it('captures authorized wallet spends', async () => {
    const adapter = new CoinbaseWalletAdapter({
      initialBalances: { USDC: 100 },
      idFactory: createIdFactory(),
    })

    const auth = await adapter.authorize(buildQuote(30, 'USDC'))
    const capture = await adapter.capture(auth.externalId, 30, 'USDC')

    expect(capture.status).toBe('settled')
    expect(capture.externalTransactionId).toMatch(/^cb_/) 
  })

  it('refunds settled wallet transactions', async () => {
    const adapter = new CoinbaseWalletAdapter({
      initialBalances: { USDC: 100 },
      idFactory: createIdFactory(),
    })

    const auth = await adapter.authorize(buildQuote(20, 'USDC'))
    const capture = await adapter.capture(auth.externalId, 20, 'USDC')
    const refund = await adapter.refund(capture.externalTransactionId, 20)

    expect(refund.status).toBe('refunded')
  })

  it('rejects unsupported assets', async () => {
    const adapter = new CoinbaseWalletAdapter({
      initialBalances: { USDC: 100 },
      idFactory: createIdFactory(),
    })

    await expect(adapter.authorize(buildQuote(10, 'BTC'))).rejects.toThrow(
      'Unsupported asset',
    )
  })

  it('returns settlement status with timestamp', async () => {
    const adapter = new CoinbaseWalletAdapter({
      initialBalances: { USDC: 100 },
      idFactory: createIdFactory(),
      now: () => FIXED_TIME,
    })

    const auth = await adapter.authorize(buildQuote(15, 'USDC'))
    const capture = await adapter.capture(auth.externalId, 15, 'USDC')
    const status = await adapter.getSettlementStatus(capture.externalTransactionId)

    expect(status.status).toBe('settled')
    expect(status.settledAt).toBe(FIXED_TIME.toISOString())
  })

  it('tracks wallet balances across authorize and capture', async () => {
    const adapter = new CoinbaseWalletAdapter({
      initialBalances: { USDC: 50 },
      idFactory: createIdFactory(),
    })

    const auth = await adapter.authorize(buildQuote(10, 'USDC'))
    expect(adapter.getBalance('USDC')).toEqual({ available: 50, held: 10 })

    await adapter.capture(auth.externalId, 10, 'USDC')
    expect(adapter.getBalance('USDC')).toEqual({ available: 40, held: 0 })
  })
})
