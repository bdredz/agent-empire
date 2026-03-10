import { nanoid } from 'nanoid'
import {
  CommerceEvent,
  CommerceReceipt,
  ReceiptId,
  createCommerceEventId,
  createReceiptId,
} from '@shared/types'

const ALLOWED_TRANSITIONS: Record<
  CommerceReceipt['status'],
  CommerceReceipt['status'][]
> = {
  pending: ['settled', 'failed'],
  settled: ['refunded', 'credited'],
  failed: [],
  refunded: [],
  credited: [],
}

export interface CreateReceiptParams
  extends Omit<CommerceReceipt, 'receiptId' | 'createdAt' | 'status'> {}

export class ReceiptService {
  private readonly receipts = new Map<string, CommerceReceipt>()
  private readonly ledger: CommerceEvent[] = []

  public async create(params: CreateReceiptParams): Promise<CommerceReceipt> {
    const receipt: CommerceReceipt = {
      ...params,
      receiptId: createReceiptId(`receipt_${nanoid()}`),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    this.receipts.set(this.key(receipt.tenantId, receipt.receiptId), receipt)
    this.appendLedger(receipt, 'captured')

    return cloneReceipt(receipt)
  }

  public async get(
    tenantId: string,
    receiptId: ReceiptId,
  ): Promise<CommerceReceipt | null> {
    const receipt = this.receipts.get(this.key(tenantId, receiptId))
    return receipt ? cloneReceipt(receipt) : null
  }

  public async updateStatus(
    tenantId: string,
    receiptId: ReceiptId,
    nextStatus: CommerceReceipt['status'],
  ): Promise<CommerceReceipt> {
    const receipt = this.requireReceipt(tenantId, receiptId)
    if (receipt.status === nextStatus) {
      return cloneReceipt(receipt)
    }

    if (!ALLOWED_TRANSITIONS[receipt.status].includes(nextStatus)) {
      throw new Error(`Invalid receipt status transition: ${receipt.status} -> ${nextStatus}`)
    }

    receipt.status = nextStatus
    this.appendLedger(receipt, statusToEventType(nextStatus))

    return cloneReceipt(receipt)
  }

  public async listByTenant(tenantId: string): Promise<CommerceReceipt[]> {
    return Array.from(this.receipts.values())
      .filter((receipt) => receipt.tenantId === tenantId)
      .map(cloneReceipt)
  }

  public async listByAgent(
    tenantId: string,
    agentId: CommerceReceipt['agentId'],
  ): Promise<CommerceReceipt[]> {
    return Array.from(this.receipts.values())
      .filter((receipt) => receipt.tenantId === tenantId)
      .filter((receipt) => receipt.agentId === agentId)
      .map(cloneReceipt)
  }

  public async listEvents(tenantId: string): Promise<CommerceEvent[]> {
    return this.ledger
      .filter((event) => event.tenantId === tenantId)
      .map(cloneEvent)
  }

  private requireReceipt(tenantId: string, receiptId: ReceiptId): CommerceReceipt {
    const receipt = this.receipts.get(this.key(tenantId, receiptId))
    if (!receipt) {
      throw new Error(`Receipt not found: ${receiptId}`)
    }

    return receipt
  }

  private appendLedger(
    receipt: CommerceReceipt,
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

  private key(tenantId: string, receiptId: ReceiptId): string {
    return `${tenantId}:${receiptId}`
  }
}

function statusToEventType(
  status: CommerceReceipt['status'],
): CommerceEvent['eventType'] {
  switch (status) {
    case 'pending':
      return 'captured'
    case 'settled':
      return 'settled'
    case 'failed':
      return 'disputed'
    case 'refunded':
      return 'refunded'
    case 'credited':
      return 'credited'
  }
}

function cloneReceipt(receipt: CommerceReceipt): CommerceReceipt {
  return { ...receipt }
}

function cloneEvent(event: CommerceEvent): CommerceEvent {
  return { ...event }
}
