import { nanoid } from 'nanoid'
import {
  CommerceEvent,
  ReceiptId,
  createCommerceEventId,
} from '@shared/types'
import { ReceiptService } from './ReceiptService'

export type DisputeStatus =
  | 'opened'
  | 'under_review'
  | 'resolved_for_buyer'
  | 'resolved_for_seller'
  | 'escalated'

export interface DisputeEvidence {
  description: string
  referenceId?: string
}

export interface CommerceDispute {
  disputeId: string
  tenantId: string
  receiptId: ReceiptId
  counterpartyId: string
  status: DisputeStatus
  reason: string
  evidence: DisputeEvidence[]
  createdAt: string
  updatedAt: string
}

const TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  opened: ['under_review', 'escalated'],
  under_review: ['resolved_for_buyer', 'resolved_for_seller', 'escalated'],
  resolved_for_buyer: [],
  resolved_for_seller: [],
  escalated: [],
}

export class DisputeService {
  private readonly disputes = new Map<string, CommerceDispute>()
  private readonly ledger: CommerceEvent[] = []

  constructor(private readonly receiptService: ReceiptService) {}

  public async open(
    tenantId: string,
    receiptId: ReceiptId,
    reason: string,
  ): Promise<CommerceDispute> {
    const receipt = await this.requireDisputableReceipt(tenantId, receiptId)
    const now = new Date().toISOString()
    const dispute: CommerceDispute = {
      disputeId: `dispute_${nanoid()}`,
      tenantId,
      receiptId,
      counterpartyId: receipt.counterpartyId,
      status: 'opened',
      reason,
      evidence: [],
      createdAt: now,
      updatedAt: now,
    }

    this.disputes.set(this.key(tenantId, dispute.disputeId), dispute)
    this.appendEvent(receipt, 'disputed')

    return cloneDispute(dispute)
  }

  public async attachEvidence(
    tenantId: string,
    disputeId: string,
    evidence: DisputeEvidence,
  ): Promise<CommerceDispute> {
    const dispute = this.requireDispute(tenantId, disputeId)
    dispute.evidence = [...dispute.evidence, { ...evidence }]
    dispute.updatedAt = new Date().toISOString()
    return cloneDispute(dispute)
  }

  public async updateStatus(
    tenantId: string,
    disputeId: string,
    nextStatus: DisputeStatus,
  ): Promise<CommerceDispute> {
    const dispute = this.requireDispute(tenantId, disputeId)
    if (dispute.status === nextStatus) {
      return cloneDispute(dispute)
    }

    if (!TRANSITIONS[dispute.status].includes(nextStatus)) {
      throw new Error(`Invalid dispute status transition: ${dispute.status} -> ${nextStatus}`)
    }

    const receipt = await this.requireReceipt(tenantId, dispute.receiptId)
    dispute.status = nextStatus
    dispute.updatedAt = new Date().toISOString()
    this.appendEvent(receipt, disputeStatusToEvent(nextStatus))

    return cloneDispute(dispute)
  }

  public async get(
    tenantId: string,
    disputeId: string,
  ): Promise<CommerceDispute | null> {
    const dispute = this.disputes.get(this.key(tenantId, disputeId))
    return dispute ? cloneDispute(dispute) : null
  }

  public async listEvents(tenantId: string): Promise<CommerceEvent[]> {
    return this.ledger
      .filter((event) => event.tenantId === tenantId)
      .map((event) => ({ ...event }))
  }

  private async requireDisputableReceipt(tenantId: string, receiptId: ReceiptId) {
    const receipt = await this.requireReceipt(tenantId, receiptId)
    if (receipt.status === 'refunded') {
      throw new Error('Cannot dispute a refunded receipt')
    }

    return receipt
  }

  private async requireReceipt(tenantId: string, receiptId: ReceiptId) {
    const receipt = await this.receiptService.get(tenantId, receiptId)
    if (!receipt) {
      throw new Error(`Receipt not found: ${receiptId}`)
    }

    return receipt
  }

  private requireDispute(tenantId: string, disputeId: string): CommerceDispute {
    const dispute = this.disputes.get(this.key(tenantId, disputeId))
    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`)
    }

    return dispute
  }

  private appendEvent(
    receipt: Awaited<ReturnType<ReceiptService['get']>> & { receiptId: ReceiptId },
    eventType: CommerceEvent['eventType'],
  ): void {
    this.ledger.push({
      eventId: createCommerceEventId(`commerce_event_${nanoid()}`),
      tenantId: receipt.tenantId,
      eventType,
      receiptId: receipt.receiptId,
      quoteId: receipt.quoteId,
      amount: receipt.amount,
      currency: receipt.currency,
      rail: receipt.rail,
      timestamp: new Date().toISOString(),
    })
  }

  private key(tenantId: string, disputeId: string): string {
    return `${tenantId}:${disputeId}`
  }
}

function disputeStatusToEvent(status: DisputeStatus): CommerceEvent['eventType'] {
  switch (status) {
    case 'opened':
    case 'under_review':
      return 'disputed'
    case 'resolved_for_buyer':
      return 'refunded'
    case 'resolved_for_seller':
      return 'reconciled'
    case 'escalated':
      return 'challenged'
  }
}

function cloneDispute(dispute: CommerceDispute): CommerceDispute {
  return {
    ...dispute,
    evidence: dispute.evidence.map((entry) => ({ ...entry })),
  }
}
