import { describe, expect, it } from 'vitest'
import {
  CommerceQuote,
  createCounterpartyId,
  createQuoteId,
} from '@shared/types'
import { X402Adapter } from './X402Adapter'

const createIdFactory = () => {
  let current = 0
  return () => `${++current}`.padStart(3, '0')
}

const FIXED_TIME = new Date('2026-03-10T12:00:00.000Z')

const buildQuote = (
  totalAmount: number,
  lineItems: CommerceQuote['lineItems'],
): CommerceQuote => ({
  quoteId: createQuoteId('quote-x402'),
  tenantId: 'tenant-1',
  counterpartyId: createCounterpartyId('counterparty-1'),
  lineItems,
  totalAmount,
  currency: 'USD',
  expiresAt: '2026-03-10T13:00:00.000Z',
  createdAt: '2026-03-10T11:00:00.000Z',
})

describe('X402Adapter', () => {
  it('authorizes valid charges', async () => {
    const adapter = new X402Adapter({ idFactory: createIdFactory() })

    const quote = buildQuote(10, [
      { description: 'API usage', amount: 5, currency: 'USD', quantity: 2 },
    ])

    const result = await adapter.authorize(quote)
    expect(result.status).toBe('authorized')
    expect(result.externalId).toMatch(/^x402_/) 
  })

  it('supports pay-per-call pricing', async () => {
    const adapter = new X402Adapter({ idFactory: createIdFactory() })

    const quote = buildQuote(2.5, [
      { description: 'API call', amount: 0.25, currency: 'USD', quantity: 10 },
    ])

    const result = await adapter.authorize(quote)
    expect(result.status).toBe('authorized')
    expect(adapter.getPricingModel(result.externalId)).toBe('per_call')
  })

  it('challenges large authorizations', async () => {
    const adapter = new X402Adapter({
      challengeAmountThreshold: 50,
      idFactory: createIdFactory(),
    })

    const quote = buildQuote(100, [
      { description: 'Enterprise API batch', amount: 25, currency: 'USD', quantity: 4 },
    ])

    const result = await adapter.authorize(quote)
    expect(result.status).toBe('challenged')
  })

  it('captures authorized transactions', async () => {
    const adapter = new X402Adapter({ idFactory: createIdFactory() })

    const quote = buildQuote(5, [
      { description: 'API usage', amount: 5, currency: 'USD', quantity: 1 },
    ])

    const auth = await adapter.authorize(quote)
    const capture = await adapter.capture(auth.externalId, 5, 'USD')

    expect(capture.status).toBe('settled')
    expect(capture.externalTransactionId).toMatch(/^x402_/) 
  })

  it('refunds settled transactions', async () => {
    const adapter = new X402Adapter({ idFactory: createIdFactory() })

    const quote = buildQuote(12, [
      { description: 'API usage', amount: 4, currency: 'USD', quantity: 3 },
    ])

    const auth = await adapter.authorize(quote)
    const capture = await adapter.capture(auth.externalId, 12, 'USD')
    const refund = await adapter.refund(capture.externalTransactionId, 12)

    expect(refund.status).toBe('refunded')
  })

  it('returns settlement status for captured transactions', async () => {
    const adapter = new X402Adapter({
      idFactory: createIdFactory(),
      now: () => FIXED_TIME,
    })

    const quote = buildQuote(7, [
      { description: 'API usage', amount: 7, currency: 'USD', quantity: 1 },
    ])

    const auth = await adapter.authorize(quote)
    const capture = await adapter.capture(auth.externalId, 7, 'USD')
    const status = await adapter.getSettlementStatus(capture.externalTransactionId)

    expect(status.status).toBe('settled')
    expect(status.settledAt).toBe(FIXED_TIME.toISOString())
  })
})
