import { CommerceRail, CommerceQuote, Mandate } from '@shared/types'

export interface RailAuthorizeResult {
  externalId: string
  status: 'authorized' | 'challenged' | 'denied'
}

export interface RailCaptureResult {
  externalTransactionId: string
  status: 'settled' | 'failed'
}

export interface RailRefundResult {
  status: 'refunded' | 'failed'
}

export interface RailSettlementStatus {
  status: string
  settledAt?: string
}

export interface ICommerceRailAdapter {
  readonly rail: CommerceRail
  authorize(quote: CommerceQuote, mandate?: Mandate): Promise<RailAuthorizeResult>
  capture(
    externalId: string,
    amount: number,
    currency: string,
  ): Promise<RailCaptureResult>
  refund(
    externalTransactionId: string,
    amount: number,
  ): Promise<RailRefundResult>
  getSettlementStatus(
    externalTransactionId: string,
  ): Promise<RailSettlementStatus>
}
