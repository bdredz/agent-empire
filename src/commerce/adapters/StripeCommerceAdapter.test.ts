import { describe, expect, it } from 'vitest'
import {
  CommerceQuote,
  createCounterpartyId,
  createQuoteId,
} from '@shared/types'
import { StripeCommerceAdapter } from './StripeCommerceAdapter'

const createIdFactory = () => {
  let current = 0
  return () => `${++current}`.padStart(3, '0')
}

const FIXED_TIME = new Date('2026-03-10T12:00:00.000Z')

const buildQuote = (amount: number, currency = 'USD'): CommerceQuote => ({
  quoteId: createQuoteId('quote-1'),
  tenantId: 'tenant-1',
  counterpartyId: createCounterpartyId('counterparty-1'),
  lineItems: [{ description: 'Subscription', amount, currency, quantity: 1 }],
  totalAmount: amount,
  currency,
  expiresAt: '2026-03-10T13:00:00.000Z',
  createdAt: '2026-03-10T11:00:00.000Z',
})

describe('StripeCommerceAdapter', () => {
  it('authorizes valid payments', async () => {
    const adapter = new StripeCommerceAdapter({
      challengeAmountThreshold: 1000,
      idFactory: createIdFactory(),
    })

    const result = await adapter.authorize(buildQuote(500))
    expect(result.status).toBe('authorized')
    expect(result.externalId).toMatch(/^pi_test_/) 
  })

  it('challenges high-value authorizations', async () => {
    const adapter = new StripeCommerceAdapter({
      challengeAmountThreshold: 100,
      idFactory: createIdFactory(),
    })

    const result = await adapter.authorize(buildQuote(250))
    expect(result.status).toBe('challenged')
  })

  it('captures authorized payments', async () => {
    const adapter = new StripeCommerceAdapter({ idFactory: createIdFactory() })

    const auth = await adapter.authorize(buildQuote(200))
    const capture = await adapter.capture(auth.externalId, 200, 'USD')

    expect(capture.status).toBe('settled')
    expect(capture.externalTransactionId).toMatch(/^pi_test_/) 
  })

  it('refunds settled transactions', async () => {
    const adapter = new StripeCommerceAdapter({ idFactory: createIdFactory() })

    const auth = await adapter.authorize(buildQuote(300))
    const capture = await adapter.capture(auth.externalId, 300, 'USD')
    const refund = await adapter.refund(capture.externalTransactionId, 300)

    expect(refund.status).toBe('refunded')
  })

  it('rejects unsupported currencies', async () => {
    const adapter = new StripeCommerceAdapter({ idFactory: createIdFactory() })

    await expect(adapter.authorize(buildQuote(100, 'JPY'))).rejects.toThrow(
      'Unsupported currency',
    )
  })

  it('returns settlement status with timestamp', async () => {
    const adapter = new StripeCommerceAdapter({
      idFactory: createIdFactory(),
      now: () => FIXED_TIME,
    })

    const auth = await adapter.authorize(buildQuote(80))
    const capture = await adapter.capture(auth.externalId, 80, 'USD')
    const status = await adapter.getSettlementStatus(capture.externalTransactionId)

    expect(status.status).toBe('settled')
    expect(status.settledAt).toBe(FIXED_TIME.toISOString())
  })
})
