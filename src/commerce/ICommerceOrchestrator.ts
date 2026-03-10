import {
  AgentId,
  AuthorizationId,
  CommerceQuote,
  CommerceReceipt,
  MandateId,
  PaymentAuthorization,
  ReceiptId,
  QuoteId,
} from '@shared/types'

export interface ReconciliationReport {
  matched: number
  unmatched: number
  issues: string[]
}

export interface ICommerceOrchestrator {
  createQuote(
    params: Omit<CommerceQuote, 'quoteId' | 'createdAt'>,
  ): Promise<CommerceQuote>
  authorize(
    quoteId: QuoteId,
    agentId: AgentId,
    mandateId?: MandateId,
  ): Promise<PaymentAuthorization>
  capture(authorizationId: AuthorizationId): Promise<CommerceReceipt>
  refund(receiptId: ReceiptId, amount?: number): Promise<CommerceReceipt>
  issueCredit(receiptId: ReceiptId, amount: number): Promise<CommerceReceipt>
  getReceipt(receiptId: ReceiptId): Promise<CommerceReceipt | null>
  reconcile(tenantId: string): Promise<ReconciliationReport>
}
