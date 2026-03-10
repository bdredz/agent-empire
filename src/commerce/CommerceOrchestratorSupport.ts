import { nanoid } from 'nanoid'
import {
  CommerceEvent,
  CommerceReceipt,
  EventType,
  PaymentAuthorization,
  TrustAuditEntry,
  createCommerceEventId,
  createTrustAuditEntryId,
} from '@shared/types'

export interface StoredAuthorization {
  authorization: PaymentAuthorization
  externalId: string
}

export interface RiskContext {
  reputationScore: number
  disputeCount: number
}

export interface CommerceOrchestratorRuntime {
  now: () => Date
  defaultRiskContext: RiskContext
}

export function createRuntime(
  now?: () => Date,
  defaultRiskContext?: Partial<RiskContext>,
): CommerceOrchestratorRuntime {
  return {
    now: now ?? (() => new Date()),
    defaultRiskContext: {
      reputationScore: defaultRiskContext?.reputationScore ?? 80,
      disputeCount: defaultRiskContext?.disputeCount ?? 0,
    },
  }
}

export function buildCommerceEvent(
  tenantId: string,
  eventType: CommerceEvent['eventType'],
  receipt: CommerceReceipt,
): CommerceEvent {
  return {
    eventId: createCommerceEventId(`commerce_event_${nanoid()}`),
    tenantId,
    eventType,
    receiptId: receipt.receiptId,
    quoteId: receipt.quoteId,
    amount: receipt.amount,
    currency: receipt.currency,
    rail: receipt.rail,
    timestamp: new Date().toISOString(),
  }
}

export function buildTrustAuditEntry(
  tenantId: string,
  eventType: TrustAuditEntry['eventType'],
  subjectId: string,
  details: Record<string, unknown>,
  timestampIso: string,
): TrustAuditEntry {
  return {
    entryId: createTrustAuditEntryId(`trust_audit_${nanoid()}`),
    tenantId,
    eventType,
    subjectId,
    actorId: 'commerce_orchestrator',
    details,
    timestamp: timestampIso,
  }
}

export function paymentDeniedMessage(reason?: string): string {
  return reason ? `Payment action denied: ${reason}` : 'Payment action denied'
}

export function assertEventTypeLiteral(_eventType: EventType): void {
  // Keeps EventType imported and compile-checked where needed.
}
