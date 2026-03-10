import {
  AgentId,
  CommerceQuote,
  CommerceRail,
  CommerceReceipt,
  Mandate,
  MandateId,
  QuoteId,
  ReceiptId,
} from '@shared/types'
import { VerificationPolicyEngine } from '../trust/VerificationPolicyEngine'
import { IMandateService } from '../trust/IMandateService'
import { ICommerceRailAdapter } from './ICommerceRailAdapter'
import { StoredAuthorization, paymentDeniedMessage } from './CommerceOrchestratorSupport'
import { ReceiptService } from './ReceiptService'

export function requireQuote(
  quoteById: Map<QuoteId, CommerceQuote>,
  quoteId: QuoteId,
): CommerceQuote {
  const quote = quoteById.get(quoteId)
  if (!quote) {
    throw new Error(`Quote not found: ${quoteId}`)
  }

  return quote
}

export function requireAuthorization(
  authorizations: Map<string, StoredAuthorization>,
  authorizationId: string,
): StoredAuthorization {
  const stored = authorizations.get(authorizationId)
  if (!stored) {
    throw new Error(`Authorization not found: ${authorizationId}`)
  }

  return stored
}

export function requireAdapter(
  railAdapters: Map<CommerceRail, ICommerceRailAdapter>,
  rail: CommerceRail,
): ICommerceRailAdapter {
  const adapter = railAdapters.get(rail)
  if (!adapter) {
    throw new Error(`Rail adapter missing: ${rail}`)
  }

  return adapter
}

export async function assertPaymentPolicy(
  verificationPolicyEngine: VerificationPolicyEngine,
  agentId: AgentId,
  mandateId?: MandateId,
): Promise<void> {
  const decision = await verificationPolicyEngine.evaluate({
    agentId,
    actionType: 'payment_authorize',
    mandateId,
  })

  if (!decision.allowed || decision.requiredLevel < 2) {
    throw new Error(paymentDeniedMessage(decision.reason))
  }
}

export async function requireValidMandate(
  mandateService: IMandateService,
  mandateId: MandateId,
  quote: CommerceQuote,
): Promise<Mandate> {
  const validation = await mandateService.validate(mandateId, {
    amount: quote.totalAmount,
    merchant: quote.counterpartyId,
  })
  if (!validation.valid) {
    throw new Error(`Mandate invalid: ${validation.reason ?? 'unknown'}`)
  }

  const mandate = await mandateService.get(mandateId)
  if (!mandate) {
    throw new Error(`Mandate not found: ${mandateId}`)
  }

  return mandate
}

export async function requireReceipt(
  receiptService: ReceiptService,
  receiptTenant: Map<ReceiptId, string>,
  receiptId: ReceiptId,
): Promise<CommerceReceipt> {
  const tenantId = receiptTenant.get(receiptId)
  if (!tenantId) {
    throw new Error(`Receipt not found: ${receiptId}`)
  }

  const receipt = await receiptService.get(tenantId, receiptId)
  if (!receipt) {
    throw new Error(`Receipt not found: ${receiptId}`)
  }

  return receipt
}
