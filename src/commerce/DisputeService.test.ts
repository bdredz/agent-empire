import { describe, expect, it } from 'vitest'
import {
  createAgentId,
  createCounterpartyId,
  createMandateId,
  createQuoteId,
} from '@shared/types'
import { DisputeService } from './DisputeService'
import { ReceiptService } from './ReceiptService'

async function createReceipt(receiptService: ReceiptService) {
  return receiptService.create({
    tenantId: 'tenant-1',
    agentId: createAgentId('agent-1'),
    counterpartyId: createCounterpartyId('counterparty-1'),
    rail: 'stripe',
    externalTransactionId: 'txn-1',
    mandateId: createMandateId('mandate-1'),
    quoteId: createQuoteId('quote-1'),
    amount: 100,
    currency: 'USD',
  })
}

describe('DisputeService', () => {
  it('opens dispute against receipt', async () => {
    const receiptService = new ReceiptService()
    const disputeService = new DisputeService(receiptService)
    const receipt = await createReceipt(receiptService)

    const dispute = await disputeService.open('tenant-1', receipt.receiptId, 'bad outcome')

    expect(dispute.receiptId).toBe(receipt.receiptId)
    expect(dispute.status).toBe('opened')
  })

  it('attaches evidence to dispute', async () => {
    const receiptService = new ReceiptService()
    const disputeService = new DisputeService(receiptService)
    const receipt = await createReceipt(receiptService)
    const dispute = await disputeService.open('tenant-1', receipt.receiptId, 'bad outcome')

    const updated = await disputeService.attachEvidence('tenant-1', dispute.disputeId, {
      description: 'trace mismatch',
      referenceId: 'ev-1',
    })

    expect(updated.evidence).toHaveLength(1)
    expect(updated.evidence[0]?.referenceId).toBe('ev-1')
  })

  it('resolves dispute for buyer', async () => {
    const receiptService = new ReceiptService()
    const disputeService = new DisputeService(receiptService)
    const receipt = await createReceipt(receiptService)
    const dispute = await disputeService.open('tenant-1', receipt.receiptId, 'bad outcome')

    await disputeService.updateStatus('tenant-1', dispute.disputeId, 'under_review')
    const resolved = await disputeService.updateStatus(
      'tenant-1',
      dispute.disputeId,
      'resolved_for_buyer',
    )

    expect(resolved.status).toBe('resolved_for_buyer')
  })

  it('resolves dispute for seller', async () => {
    const receiptService = new ReceiptService()
    const disputeService = new DisputeService(receiptService)
    const receipt = await createReceipt(receiptService)
    const dispute = await disputeService.open('tenant-1', receipt.receiptId, 'bad outcome')

    await disputeService.updateStatus('tenant-1', dispute.disputeId, 'under_review')
    const resolved = await disputeService.updateStatus(
      'tenant-1',
      dispute.disputeId,
      'resolved_for_seller',
    )

    expect(resolved.status).toBe('resolved_for_seller')
  })

  it('escalates dispute', async () => {
    const receiptService = new ReceiptService()
    const disputeService = new DisputeService(receiptService)
    const receipt = await createReceipt(receiptService)
    const dispute = await disputeService.open('tenant-1', receipt.receiptId, 'bad outcome')

    const escalated = await disputeService.updateStatus(
      'tenant-1',
      dispute.disputeId,
      'escalated',
    )

    expect(escalated.status).toBe('escalated')
  })

  it('rejects dispute open on refunded receipt', async () => {
    const receiptService = new ReceiptService()
    const disputeService = new DisputeService(receiptService)
    const receipt = await createReceipt(receiptService)

    await receiptService.updateStatus('tenant-1', receipt.receiptId, 'settled')
    await receiptService.updateStatus('tenant-1', receipt.receiptId, 'refunded')

    await expect(
      disputeService.open('tenant-1', receipt.receiptId, 'too late'),
    ).rejects.toThrow('Cannot dispute a refunded receipt')
  })
})
