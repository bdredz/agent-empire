import { nanoid } from 'nanoid'
import {
  type AgentId, type AuthorizationId, type CommerceEvent, type CommerceQuote, type CommerceRail,
  type CommerceReceipt, type MandateId, type PaymentAuthorization, type QuoteId, type ReceiptId,
  createAuthorizationId,
} from '@shared/types'
import { VerificationPolicyEngine } from '../trust/VerificationPolicyEngine'
import { IMandateService } from '../trust/IMandateService'
import { TrustAuditLog } from '../trust/TrustAuditLog'
import { ICommerceOrchestrator, ReconciliationReport } from './ICommerceOrchestrator'
import { ICommerceRailAdapter } from './ICommerceRailAdapter'
import { QuoteService } from './QuoteService'
import { ReceiptService } from './ReceiptService'
import { RefundPolicyEngine } from './RefundPolicyEngine'
import { SettlementReconciler } from './SettlementReconciler'
import {
  type CommerceOrchestratorRuntime, type StoredAuthorization, buildCommerceEvent, buildTrustAuditEntry, createRuntime,
} from './CommerceOrchestratorSupport'
import {
  assertPaymentPolicy, requireAdapter, requireAuthorization, requireQuote, requireReceipt, requireValidMandate,
} from './CommerceOrchestratorGuards'

export interface CommerceOrchestratorOptions {
  defaultRail?: CommerceRail
  now?: () => Date
  defaultRiskContext?: {
    reputationScore?: number
    disputeCount?: number
  }
  selectRail?: (quote: CommerceQuote) => CommerceRail
}

export class CommerceOrchestrator implements ICommerceOrchestrator {
  private readonly runtime: CommerceOrchestratorRuntime
  private readonly defaultRail: CommerceRail
  private readonly quoteById = new Map<QuoteId, CommerceQuote>()
  private readonly authorizations = new Map<AuthorizationId, StoredAuthorization>()
  private readonly receiptTenant = new Map<ReceiptId, string>()
  private readonly events: CommerceEvent[] = []
  private readonly selectRail: (quote: CommerceQuote) => CommerceRail

  constructor(
    private readonly quoteService: QuoteService,
    private readonly receiptService: ReceiptService,
    private readonly refundPolicyEngine: RefundPolicyEngine,
    private readonly settlementReconciler: SettlementReconciler,
    private readonly mandateService: IMandateService,
    private readonly verificationPolicyEngine: VerificationPolicyEngine,
    private readonly trustAuditLog: TrustAuditLog,
    private readonly railAdapters: Map<CommerceRail, ICommerceRailAdapter>,
    options: Partial<CommerceOrchestratorOptions> = {},
  ) {
    this.defaultRail = options.defaultRail ?? 'stripe'
    this.selectRail = options.selectRail ?? (() => this.defaultRail)
    this.runtime = createRuntime(options.now, options.defaultRiskContext)
  }

  public async createQuote(params: Omit<CommerceQuote, 'quoteId' | 'createdAt'>): Promise<CommerceQuote> {
    const quote = await this.quoteService.create(params)
    this.quoteById.set(quote.quoteId, quote)
    return quote
  }

  public async authorize(
    quoteId: QuoteId,
    agentId: AgentId,
    mandateId?: MandateId,
  ): Promise<PaymentAuthorization> {
    const quote = requireQuote(this.quoteById, quoteId)
    const activeQuote = await this.quoteService.get(quote.tenantId, quoteId)
    if (!activeQuote) {
      throw new Error(`Quote unavailable: ${quoteId}`)
    }
    await assertPaymentPolicy(this.verificationPolicyEngine, agentId, mandateId)
    const mandate = mandateId
      ? await requireValidMandate(this.mandateService, mandateId, activeQuote)
      : undefined
    const rail = this.selectRail(activeQuote)
    const adapter = requireAdapter(this.railAdapters, rail)
    const authResult = await adapter.authorize(activeQuote, mandate)

    const authorization: PaymentAuthorization = {
      authorizationId: createAuthorizationId(`authorization_${nanoid()}`),
      tenantId: activeQuote.tenantId,
      businessUnitId: activeQuote.businessUnitId,
      agentId,
      mandateId,
      quoteId,
      rail,
      status: authResult.status,
      amount: activeQuote.totalAmount,
      currency: activeQuote.currency,
      createdAt: this.runtime.now().toISOString(),
    }

    this.authorizations.set(authorization.authorizationId, { authorization, externalId: authResult.externalId })
    await this.trustAuditLog.append(
      buildTrustAuditEntry(
        quote.tenantId,
        'verification_override',
        agentId,
        { action: 'authorize', rail },
        this.runtime.now().toISOString(),
      ),
    )

    return authorization
  }

  public async capture(authorizationId: AuthorizationId): Promise<CommerceReceipt> {
    const stored = requireAuthorization(this.authorizations, authorizationId)
    const authorization = stored.authorization
    if (authorization.status !== 'authorized') {
      throw new Error(`Authorization not capturable: ${authorization.status}`)
    }

    await assertPaymentPolicy(this.verificationPolicyEngine, authorization.agentId, authorization.mandateId)
    const quote = requireQuote(this.quoteById, authorization.quoteId as QuoteId)
    const adapter = requireAdapter(this.railAdapters, authorization.rail)
    const captureResult = await adapter.capture(stored.externalId, authorization.amount, authorization.currency)

    const receipt = await this.receiptService.create({
      tenantId: authorization.tenantId,
      businessUnitId: authorization.businessUnitId,
      agentId: authorization.agentId,
      counterpartyId: quote.counterpartyId,
      rail: authorization.rail,
      externalTransactionId: captureResult.externalTransactionId,
      mandateId: authorization.mandateId,
      quoteId: authorization.quoteId,
      amount: authorization.amount,
      currency: authorization.currency,
    })

    const nextStatus = captureResult.status === 'settled' ? 'settled' : 'failed'
    const updated = await this.receiptService.updateStatus(receipt.tenantId, receipt.receiptId, nextStatus)
    this.receiptTenant.set(updated.receiptId, updated.tenantId)
    this.events.push(buildCommerceEvent(updated.tenantId, nextStatus === 'settled' ? 'settled' : 'challenged', updated))
    return updated
  }

  public async refund(receiptId: ReceiptId, amount?: number): Promise<CommerceReceipt> {
    const receipt = await requireReceipt(this.receiptService, this.receiptTenant, receiptId)
    await assertPaymentPolicy(this.verificationPolicyEngine, receipt.agentId, receipt.mandateId)

    const refundAmount = amount ?? receipt.amount
    const policy = this.refundPolicyEngine.evaluate({
      amount: refundAmount,
      purchaseTimestamp: receipt.createdAt,
      reputationScore: this.runtime.defaultRiskContext.reputationScore,
      disputeCount: this.runtime.defaultRiskContext.disputeCount,
    })

    if (policy.decision === 'manual_review') throw new Error('Refund requires manual review')
    if (policy.decision === 'auto_credit') return this.issueCredit(receiptId, refundAmount)

    if (!receipt.externalTransactionId) throw new Error('Cannot refund receipt without external transaction id')
    const adapter = requireAdapter(this.railAdapters, receipt.rail)
    const result = await adapter.refund(receipt.externalTransactionId, refundAmount)
    if (result.status !== 'refunded') throw new Error('Rail refund failed')

    const updated = await this.receiptService.updateStatus(receipt.tenantId, receipt.receiptId, 'refunded')
    this.events.push(buildCommerceEvent(updated.tenantId, 'refunded', updated))
    return updated
  }

  public async issueCredit(receiptId: ReceiptId, amount: number): Promise<CommerceReceipt> {
    const source = await requireReceipt(this.receiptService, this.receiptTenant, receiptId)
    await assertPaymentPolicy(this.verificationPolicyEngine, source.agentId, source.mandateId)

    const pending = await this.receiptService.create({
      tenantId: source.tenantId,
      businessUnitId: source.businessUnitId,
      agentId: source.agentId,
      counterpartyId: source.counterpartyId,
      rail: source.rail,
      quoteId: source.quoteId,
      mandateId: source.mandateId,
      amount,
      currency: source.currency,
    })

    const settled = await this.receiptService.updateStatus(pending.tenantId, pending.receiptId, 'settled')
    const credited = await this.receiptService.updateStatus(settled.tenantId, settled.receiptId, 'credited')
    this.receiptTenant.set(credited.receiptId, credited.tenantId)
    this.events.push(buildCommerceEvent(credited.tenantId, 'credited', credited))
    return credited
  }

  public async getReceipt(receiptId: ReceiptId): Promise<CommerceReceipt | null> {
    const tenantId = this.receiptTenant.get(receiptId)
    if (!tenantId) return null
    return this.receiptService.get(tenantId, receiptId)
  }

  public async reconcile(tenantId: string): Promise<ReconciliationReport> {
    return this.settlementReconciler.reconcile(tenantId)
  }
}
