import { describe, expect, it } from 'vitest'
import {
  CommerceQuote,
  createCounterpartyId,
  createQuoteId,
} from '@shared/types'
import { McpPayAdapter } from './McpPayAdapter'

const createIdFactory = () => {
  let current = 0
  return () => `${++current}`.padStart(3, '0')
}

const FIXED_TIME = new Date('2026-03-10T12:00:00.000Z')

const buildQuote = (
  totalAmount: number,
  lineItems: CommerceQuote['lineItems'],
): CommerceQuote => ({
  quoteId: createQuoteId('quote-mcp'),
  tenantId: 'tenant-1',
  counterpartyId: createCounterpartyId('counterparty-1'),
  lineItems,
  totalAmount,
  currency: 'USD',
  expiresAt: '2026-03-10T13:00:00.000Z',
  createdAt: '2026-03-10T11:00:00.000Z',
})

describe('McpPayAdapter', () => {
  it('authorizes valid per-call billing quotes', async () => {
    const adapter = new McpPayAdapter({ idFactory: createIdFactory() })

    const quote = buildQuote(6, [
      { description: 'Tool call', amount: 2, currency: 'USD', quantity: 3 },
    ])

    const result = await adapter.authorize(quote)
    expect(result.status).toBe('authorized')
    expect(result.externalId).toMatch(/^mcp_/) 
  })

  it('captures authorized payments', async () => {
    const adapter = new McpPayAdapter({ idFactory: createIdFactory() })

    const quote = buildQuote(4, [
      { description: 'Tool call', amount: 4, currency: 'USD', quantity: 1 },
    ])

    const auth = await adapter.authorize(quote)
    const capture = await adapter.capture(auth.externalId, 4, 'USD')

    expect(capture.status).toBe('settled')
    expect(capture.externalTransactionId).toMatch(/^mcp_/) 
  })

  it('refunds settled transactions', async () => {
    const adapter = new McpPayAdapter({ idFactory: createIdFactory() })

    const quote = buildQuote(9, [
      { description: 'Tool call', amount: 3, currency: 'USD', quantity: 3 },
    ])

    const auth = await adapter.authorize(quote)
    const capture = await adapter.capture(auth.externalId, 9, 'USD')
    const refund = await adapter.refund(capture.externalTransactionId, 9)

    expect(refund.status).toBe('refunded')
  })

  it('identifies per-call billing mode', async () => {
    const adapter = new McpPayAdapter({ idFactory: createIdFactory() })

    const quote = buildQuote(2, [
      { description: 'MCP call', amount: 1, currency: 'USD', quantity: 2 },
    ])

    const auth = await adapter.authorize(quote)
    expect(adapter.getBillingMode(auth.externalId)).toBe('per_call')
  })

  it('identifies per-session billing mode', async () => {
    const adapter = new McpPayAdapter({ idFactory: createIdFactory() })

    const quote = buildQuote(10, [
      { description: 'Tool session', amount: 10, currency: 'USD', quantity: 1 },
    ])

    const auth = await adapter.authorize(quote)
    expect(adapter.getBillingMode(auth.externalId)).toBe('per_session')
  })

  it('returns settlement status for captured transactions', async () => {
    const adapter = new McpPayAdapter({
      idFactory: createIdFactory(),
      now: () => FIXED_TIME,
    })

    const quote = buildQuote(3, [
      { description: 'Tool call', amount: 3, currency: 'USD', quantity: 1 },
    ])

    const auth = await adapter.authorize(quote)
    const capture = await adapter.capture(auth.externalId, 3, 'USD')
    const status = await adapter.getSettlementStatus(capture.externalTransactionId)

    expect(status.status).toBe('settled')
    expect(status.settledAt).toBe(FIXED_TIME.toISOString())
  })
})
