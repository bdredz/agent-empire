import { nanoid } from 'nanoid'
import {
  CommerceEvent,
  CommerceReceipt,
  CommerceRail,
  createCommerceEventId,
} from '@shared/types'
import { ICommerceRailAdapter } from './ICommerceRailAdapter'
import { ReconciliationReport } from './ICommerceOrchestrator'
import { ReceiptService } from './ReceiptService'

export class SettlementReconciler {
  private readonly ledger: CommerceEvent[] = []

  constructor(
    private readonly receiptService: ReceiptService,
    private readonly railAdapters: Map<CommerceRail, ICommerceRailAdapter>,
  ) {}

  public async reconcile(tenantId: string): Promise<ReconciliationReport> {
    const receipts = await this.receiptService.listByTenant(tenantId)
    const candidates = receipts.filter(
      (receipt) => receipt.status === 'pending' || receipt.status === 'settled',
    )

    const issues: string[] = []
    const seenExternalIds = new Set<string>()
    let matched = 0

    for (const receipt of candidates) {
      const issueMessage = await this.inspectReceipt(seenExternalIds, receipt)
      if (issueMessage) {
        issues.push(issueMessage)
        this.appendDiscrepancyEvent(receipt, issueMessage)
      } else {
        matched += 1
      }
    }

    return {
      matched,
      unmatched: issues.length,
      issues,
    }
  }

  public async listEvents(tenantId: string): Promise<CommerceEvent[]> {
    return this.ledger
      .filter((event) => event.tenantId === tenantId)
      .map((event) => ({ ...event }))
  }

  private async inspectReceipt(
    seenExternalIds: Set<string>,
    receipt: CommerceReceipt,
  ): Promise<string | null> {
    if (!receipt.externalTransactionId) {
      return `Missing capture for receipt ${receipt.receiptId}`
    }

    if (seenExternalIds.has(receipt.externalTransactionId)) {
      return `Duplicate external transaction ${receipt.externalTransactionId}`
    }
    seenExternalIds.add(receipt.externalTransactionId)

    const adapter = this.railAdapters.get(receipt.rail)
    if (!adapter) {
      return `No rail adapter configured for ${receipt.rail}`
    }

    const settlement = await adapter.getSettlementStatus(receipt.externalTransactionId)
    if (settlement.status === 'amount_mismatch') {
      return `Amount mismatch for receipt ${receipt.receiptId}`
    }

    if (receipt.status === 'pending' && settlement.status === 'settled') {
      return `Stale pending settlement for receipt ${receipt.receiptId}`
    }

    if (receipt.status === 'settled' && settlement.status !== 'settled') {
      return `Settlement mismatch for receipt ${receipt.receiptId}: ${settlement.status}`
    }

    return null
  }

  private appendDiscrepancyEvent(receipt: CommerceReceipt, message: string): void {
    void message
    this.ledger.push({
      eventId: createCommerceEventId(`commerce_event_${nanoid()}`),
      tenantId: receipt.tenantId,
      eventType: 'disputed',
      receiptId: receipt.receiptId,
      quoteId: receipt.quoteId,
      amount: receipt.amount,
      currency: receipt.currency,
      rail: receipt.rail,
      timestamp: new Date().toISOString(),
    })
  }
}
