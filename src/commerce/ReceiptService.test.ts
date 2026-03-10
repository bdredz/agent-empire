import { describe, expect, it } from 'vitest'
import {
  createAgentId,
  createCounterpartyId,
  createMandateId,
  createQuoteId,
} from '@shared/types'
import { ReceiptService } from './ReceiptService'

async function createReceipt(service: ReceiptService, tenantId = 'tenant-1') {
  return service.create({
    tenantId,
    agentId: createAgentId('agent-1'),
    counterpartyId: createCounterpartyId('counterparty-1'),
    rail: 'stripe',
    externalTransactionId: 'txn-1',
    mandateId: createMandateId('mandate-1'),
    quoteId: createQuoteId('quote-1'),
    amount: 50,
    currency: 'USD',
  })
}

describe('ReceiptService', () => {
  it('creates pending receipt and appends event', async () => {
    const service = new ReceiptService()

    const receipt = await createReceipt(service)
    const events = await service.listEvents('tenant-1')

    expect((receipt.receiptId as string).startsWith('receipt_')).toBe(true)
    expect(receipt.status).toBe('pending')
    expect(events[0]?.eventType).toBe('captured')
  })

  it('updates status from pending to settled', async () => {
    const service = new ReceiptService()
    const receipt = await createReceipt(service)

    const updated = await service.updateStatus('tenant-1', receipt.receiptId, 'settled')

    expect(updated.status).toBe('settled')
  })

  it('stores link to quote id', async () => {
    const service = new ReceiptService()

    const receipt = await createReceipt(service)

    expect(receipt.quoteId).toBe(createQuoteId('quote-1'))
  })

  it('stores link to mandate id', async () => {
    const service = new ReceiptService()

    const receipt = await createReceipt(service)

    expect(receipt.mandateId).toBe(createMandateId('mandate-1'))
  })

  it('allows settled to refunded transition', async () => {
    const service = new ReceiptService()
    const receipt = await createReceipt(service)

    await service.updateStatus('tenant-1', receipt.receiptId, 'settled')
    const refunded = await service.updateStatus('tenant-1', receipt.receiptId, 'refunded')

    expect(refunded.status).toBe('refunded')
  })

  it('rejects invalid pending to refunded transition', async () => {
    const service = new ReceiptService()
    const receipt = await createReceipt(service)

    await expect(
      service.updateStatus('tenant-1', receipt.receiptId, 'refunded'),
    ).rejects.toThrow('Invalid receipt status transition')
  })

  it('lists receipts by tenant', async () => {
    const service = new ReceiptService()
    await createReceipt(service, 'tenant-1')
    await createReceipt(service, 'tenant-2')

    const receipts = await service.listByTenant('tenant-1')

    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.tenantId).toBe('tenant-1')
  })

  it('lists receipts by agent in tenant scope', async () => {
    const service = new ReceiptService()

    await service.create({
      tenantId: 'tenant-1',
      agentId: createAgentId('agent-a'),
      counterpartyId: createCounterpartyId('counterparty-1'),
      rail: 'stripe',
      amount: 10,
      currency: 'USD',
    })
    await service.create({
      tenantId: 'tenant-1',
      agentId: createAgentId('agent-b'),
      counterpartyId: createCounterpartyId('counterparty-1'),
      rail: 'stripe',
      amount: 20,
      currency: 'USD',
    })

    const receipts = await service.listByAgent('tenant-1', createAgentId('agent-a'))

    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.agentId).toBe(createAgentId('agent-a'))
  })
})
