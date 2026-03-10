import { describe, expect, it } from 'vitest'
import {
  CommerceQuote,
  CommerceRail,
  createAgentId,
  createCounterpartyId,
  createQuoteId,
} from '@shared/types'
import { ICommerceRailAdapter } from './ICommerceRailAdapter'
import { ReceiptService } from './ReceiptService'
import { SettlementReconciler } from './SettlementReconciler'

class StubRailAdapter implements ICommerceRailAdapter {
  public readonly rail: CommerceRail
  private readonly statusByExternalId: Record<string, string>

  constructor(rail: CommerceRail, statusByExternalId: Record<string, string>) {
    this.rail = rail
    this.statusByExternalId = statusByExternalId
  }

  public async authorize(_quote: CommerceQuote) {
    return { externalId: 'ext-1', status: 'authorized' as const }
  }

  public async capture(_externalId: string) {
    return {
      externalTransactionId: 'txn-capture',
      status: 'settled' as const,
    }
  }

  public async refund(_externalTransactionId: string, _amount: number) {
    return { status: 'refunded' as const }
  }

  public async getSettlementStatus(externalTransactionId: string) {
    return {
      status: this.statusByExternalId[externalTransactionId] ?? 'pending',
      settledAt: '2026-03-10T00:00:00.000Z',
    }
  }
}

async function createReceipt(
  receiptService: ReceiptService,
  options: {
    tenantId?: string
    rail?: CommerceRail
    externalTransactionId?: string
    amount?: number
  } = {},
) {
  return receiptService.create({
    tenantId: options.tenantId ?? 'tenant-1',
    agentId: createAgentId('agent-1'),
    counterpartyId: createCounterpartyId('counterparty-1'),
    rail: options.rail ?? 'stripe',
    externalTransactionId: options.externalTransactionId,
    quoteId: createQuoteId('quote-1'),
    amount: options.amount ?? 100,
    currency: 'USD',
  })
}

describe('SettlementReconciler', () => {
  it('returns matched report when all receipts settle cleanly', async () => {
    const receiptService = new ReceiptService()
    const receipt = await createReceipt(receiptService, { externalTransactionId: 'txn-1' })
    await receiptService.updateStatus('tenant-1', receipt.receiptId, 'settled')

    const adapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', new StubRailAdapter('stripe', { 'txn-1': 'settled' })],
    ])

    const reconciler = new SettlementReconciler(receiptService, adapters)
    const report = await reconciler.reconcile('tenant-1')

    expect(report).toEqual({ matched: 1, unmatched: 0, issues: [] })
  })

  it('detects missing capture ids', async () => {
    const receiptService = new ReceiptService()
    await createReceipt(receiptService)

    const reconciler = new SettlementReconciler(receiptService, new Map())
    const report = await reconciler.reconcile('tenant-1')

    expect(report.unmatched).toBe(1)
    expect(report.issues[0]).toContain('Missing capture')
  })

  it('detects duplicate external transaction ids', async () => {
    const receiptService = new ReceiptService()
    const one = await createReceipt(receiptService, { externalTransactionId: 'dup-1' })
    const two = await createReceipt(receiptService, { externalTransactionId: 'dup-1' })
    await receiptService.updateStatus('tenant-1', one.receiptId, 'settled')
    await receiptService.updateStatus('tenant-1', two.receiptId, 'settled')

    const adapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', new StubRailAdapter('stripe', { 'dup-1': 'settled' })],
    ])

    const reconciler = new SettlementReconciler(receiptService, adapters)
    const report = await reconciler.reconcile('tenant-1')

    expect(report.unmatched).toBe(1)
    expect(report.issues[0]).toContain('Duplicate external transaction')
  })

  it('detects stale pending receipts already settled by provider', async () => {
    const receiptService = new ReceiptService()
    await createReceipt(receiptService, { externalTransactionId: 'txn-stale' })

    const adapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', new StubRailAdapter('stripe', { 'txn-stale': 'settled' })],
    ])

    const reconciler = new SettlementReconciler(receiptService, adapters)
    const report = await reconciler.reconcile('tenant-1')

    expect(report.unmatched).toBe(1)
    expect(report.issues[0]).toContain('Stale pending settlement')
  })

  it('detects amount mismatch status from provider', async () => {
    const receiptService = new ReceiptService()
    const receipt = await createReceipt(receiptService, {
      externalTransactionId: 'txn-mismatch',
      amount: 200,
    })
    await receiptService.updateStatus('tenant-1', receipt.receiptId, 'settled')

    const adapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', new StubRailAdapter('stripe', { 'txn-mismatch': 'amount_mismatch' })],
    ])

    const reconciler = new SettlementReconciler(receiptService, adapters)
    const report = await reconciler.reconcile('tenant-1')

    expect(report.unmatched).toBe(1)
    expect(report.issues[0]).toContain('Amount mismatch')
  })

  it('handles empty ledger', async () => {
    const receiptService = new ReceiptService()
    const reconciler = new SettlementReconciler(receiptService, new Map())

    const report = await reconciler.reconcile('tenant-1')

    expect(report).toEqual({ matched: 0, unmatched: 0, issues: [] })
  })

  it('reconciles across multiple rails', async () => {
    const receiptService = new ReceiptService()

    const stripe = await createReceipt(receiptService, {
      rail: 'stripe',
      externalTransactionId: 'stripe-1',
    })
    const x402 = await createReceipt(receiptService, {
      rail: 'x402',
      externalTransactionId: 'x402-1',
    })

    await receiptService.updateStatus('tenant-1', stripe.receiptId, 'settled')
    await receiptService.updateStatus('tenant-1', x402.receiptId, 'settled')

    const adapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', new StubRailAdapter('stripe', { 'stripe-1': 'settled' })],
      ['x402', new StubRailAdapter('x402', { 'x402-1': 'settled' })],
    ])

    const reconciler = new SettlementReconciler(receiptService, adapters)
    const report = await reconciler.reconcile('tenant-1')

    expect(report).toEqual({ matched: 2, unmatched: 0, issues: [] })
  })

  it('scopes reconciliation to tenant', async () => {
    const receiptService = new ReceiptService()

    const tenantOneReceipt = await createReceipt(receiptService, {
      tenantId: 'tenant-1',
      externalTransactionId: 'tenant-one',
    })
    const tenantTwoReceipt = await createReceipt(receiptService, {
      tenantId: 'tenant-2',
      externalTransactionId: 'tenant-two',
    })

    await receiptService.updateStatus('tenant-1', tenantOneReceipt.receiptId, 'settled')
    await receiptService.updateStatus('tenant-2', tenantTwoReceipt.receiptId, 'settled')

    const adapters = new Map<CommerceRail, ICommerceRailAdapter>([
      ['stripe', new StubRailAdapter('stripe', {
        'tenant-one': 'settled',
        'tenant-two': 'amount_mismatch',
      })],
    ])

    const reconciler = new SettlementReconciler(receiptService, adapters)
    const report = await reconciler.reconcile('tenant-1')

    expect(report).toEqual({ matched: 1, unmatched: 0, issues: [] })
  })
})
