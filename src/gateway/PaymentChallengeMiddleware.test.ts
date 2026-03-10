import { describe, expect, it } from 'vitest'
import {
  createAgentId,
  createCounterpartyId,
} from '@shared/types'
import { ReceiptService } from '../commerce/ReceiptService'
import { PaymentChallengeMiddleware } from './PaymentChallengeMiddleware'
import { GatewayContext } from './GatewayTypes'

const createContext = (
  paid: boolean,
  headers: Record<string, string | undefined> = {},
): GatewayContext => ({
  request: {
    method: 'POST',
    path: '/tool/run',
    headers,
  },
  route: {
    method: 'POST',
    path: '/tool/run',
    paid: paid
      ? {
          requiredAmount: 25,
          acceptedRails: ['stripe', 'x402'],
          quoteEndpoint: '/quotes/create',
        }
      : undefined,
    handler: async () => ({ status: 200, body: { ok: true }, headers: {} }),
  },
  state: {
    requestId: 'req-1',
    trustStatus: 'unknown',
    tenantId: 'tenant-1',
  },
})

async function createSettledReceipt(receiptService: ReceiptService) {
  const receipt = await receiptService.create({
    tenantId: 'tenant-1',
    agentId: createAgentId('agent-1'),
    counterpartyId: createCounterpartyId('counterparty-1'),
    rail: 'stripe',
    amount: 50,
    currency: 'USD',
  })

  return receiptService.updateStatus('tenant-1', receipt.receiptId, 'settled')
}

describe('PaymentChallengeMiddleware', () => {
  it('passes through free routes', async () => {
    const middleware = new PaymentChallengeMiddleware(new ReceiptService()).createMiddleware()
    const context = createContext(false)

    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(200)
  })

  it('returns 402 for paid routes without proof', async () => {
    const middleware = new PaymentChallengeMiddleware(new ReceiptService()).createMiddleware()
    const context = createContext(true)

    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(402)
    expect(response.body).toMatchObject({
      error: { code: 'payment_required' },
    })
  })

  it('accepts valid settled payment proof', async () => {
    const receiptService = new ReceiptService()
    const receipt = await createSettledReceipt(receiptService)

    const middleware = new PaymentChallengeMiddleware(receiptService).createMiddleware()
    const context = createContext(true, {
      'x-tenant-id': 'tenant-1',
      'x-payment-proof': receipt.receiptId,
    })

    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(200)
  })

  it('rejects invalid payment proof', async () => {
    const middleware = new PaymentChallengeMiddleware(new ReceiptService()).createMiddleware()
    const context = createContext(true, {
      'x-tenant-id': 'tenant-1',
      'x-payment-proof': 'receipt_missing',
    })

    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(402)
    expect(response.body).toMatchObject({
      error: { code: 'invalid_payment_proof' },
    })
  })

  it('rejects expired payment proof', async () => {
    const receiptService = new ReceiptService()
    const receipt = await createSettledReceipt(receiptService)
    const nowMs = Date.now() + 10 * 60 * 1000

    const middleware = new PaymentChallengeMiddleware(receiptService, {
      maxProofAgeSec: 60,
      now: () => new Date(nowMs),
    }).createMiddleware()

    const context = createContext(true, {
      'x-tenant-id': 'tenant-1',
      'x-payment-proof': receipt.receiptId,
    })

    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(402)
    expect(response.body).toMatchObject({
      error: { code: 'expired_payment_proof' },
    })
  })

  it('returns expected challenge payload structure', async () => {
    const middleware = new PaymentChallengeMiddleware(new ReceiptService()).createMiddleware()
    const context = createContext(true)

    const response = await middleware(context, async () => ({ status: 200, body: {} }))

    expect(response.status).toBe(402)
    expect(response.body).toMatchObject({
      challenge: {
        requiredAmount: 25,
        acceptedRails: ['stripe', 'x402'],
        quoteEndpoint: '/quotes/create',
      },
    })
  })
})
