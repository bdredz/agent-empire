import { nanoid } from 'nanoid'
import {
  AgentId,
  Mandate,
  MandateId,
  TrustAuditEntry,
  createMandateId,
  createTrustAuditEntryId,
} from '@shared/types'
import {
  IMandateService,
  MandateValidationAction,
  MandateValidationResult,
} from './IMandateService'
import { TrustAuditLog } from './TrustAuditLog'

export class MandateService implements IMandateService {
  private readonly mandates = new Map<MandateId, Mandate>()

  constructor(private readonly trustAuditLog: TrustAuditLog) {}

  public async create(
    params: Omit<Mandate, 'mandateId' | 'status' | 'createdAt'>,
  ): Promise<Mandate> {
    const mandate: Mandate = {
      ...params,
      mandateId: createMandateId(`mandate_${nanoid()}`),
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    this.mandates.set(mandate.mandateId, mandate)
    await this.appendAudit(mandate, 'mandate_created', {
      delegatedAgentId: mandate.delegatedAgentId,
      purpose: mandate.purpose,
    })

    return cloneMandate(mandate)
  }

  public async get(mandateId: MandateId): Promise<Mandate | null> {
    const mandate = this.mandates.get(mandateId)
    if (!mandate) {
      return null
    }

    this.refreshExpiry(mandate)
    return cloneMandate(mandate)
  }

  public async validate(
    mandateId: MandateId,
    action: MandateValidationAction,
  ): Promise<MandateValidationResult> {
    const mandate = this.mandates.get(mandateId)
    if (!mandate) {
      return { valid: false, reason: 'not_found' }
    }

    this.refreshExpiry(mandate)
    if (mandate.status === 'expired') {
      return { valid: false, reason: 'expired' }
    }

    if (mandate.status === 'revoked') {
      return { valid: false, reason: 'revoked' }
    }

    if (mandate.status === 'consumed') {
      return { valid: false, reason: 'consumed' }
    }

    if (!hasPaymentScope(mandate.scope)) {
      return { valid: false, reason: 'out_of_scope' }
    }

    if (mandate.maxAmount !== undefined && action.amount !== undefined) {
      if (action.amount > mandate.maxAmount) {
        return { valid: false, reason: 'amount_exceeded' }
      }
    }

    if (mandate.allowedMerchants?.length && action.merchant) {
      if (!mandate.allowedMerchants.includes(action.merchant)) {
        return { valid: false, reason: 'merchant_not_allowed' }
      }
    }

    if (mandate.allowedCategories?.length && action.category) {
      if (!mandate.allowedCategories.includes(action.category)) {
        return { valid: false, reason: 'category_not_allowed' }
      }
    }

    return { valid: true }
  }

  public async revoke(mandateId: MandateId): Promise<Mandate> {
    const mandate = this.requireMandate(mandateId)
    if (mandate.status !== 'revoked') {
      mandate.status = 'revoked'
      await this.appendAudit(mandate, 'mandate_revoked', {})
    }

    return cloneMandate(mandate)
  }

  public async consume(mandateId: MandateId): Promise<Mandate> {
    const mandate = this.requireMandate(mandateId)
    this.refreshExpiry(mandate)

    if (mandate.status === 'revoked') {
      throw new Error('Revoked mandate cannot be consumed')
    }

    if (mandate.status === 'expired') {
      throw new Error('Expired mandate cannot be consumed')
    }

    if (mandate.status === 'consumed') {
      throw new Error('Consumed mandate cannot be consumed again')
    }

    mandate.status = 'consumed'
    await this.appendAudit(mandate, 'mandate_consumed', {})
    return cloneMandate(mandate)
  }

  public async listByAgent(agentId: AgentId): Promise<Mandate[]> {
    return Array.from(this.mandates.values())
      .filter((mandate) => mandate.delegatedAgentId === agentId)
      .map(cloneMandate)
  }

  public async listActive(tenantId: string): Promise<Mandate[]> {
    const mandates = Array.from(this.mandates.values())
      .filter((mandate) => mandate.tenantId === tenantId)

    for (const mandate of mandates) {
      this.refreshExpiry(mandate)
    }

    return mandates
      .filter((mandate) => mandate.status === 'active')
      .map(cloneMandate)
  }

  private requireMandate(mandateId: MandateId): Mandate {
    const mandate = this.mandates.get(mandateId)
    if (!mandate) {
      throw new Error(`Mandate not found: ${mandateId}`)
    }

    return mandate
  }

  private refreshExpiry(mandate: Mandate): void {
    if (mandate.status !== 'active') {
      return
    }

    if (Date.parse(mandate.expiresAt) < Date.now()) {
      mandate.status = 'expired'
    }
  }

  private async appendAudit(
    mandate: Mandate,
    eventType: TrustAuditEntry['eventType'],
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.trustAuditLog.append({
      entryId: createTrustAuditEntryId(`trust_audit_${nanoid()}`),
      tenantId: mandate.tenantId,
      eventType,
      subjectId: mandate.mandateId,
      actorId: 'system',
      details,
      timestamp: new Date().toISOString(),
    })
  }
}

function hasPaymentScope(scope: string[]): boolean {
  return scope.includes('*') || scope.includes('payment')
}

function cloneMandate(mandate: Mandate): Mandate {
  return {
    ...mandate,
    scope: [...mandate.scope],
    allowedMerchants: mandate.allowedMerchants
      ? [...mandate.allowedMerchants]
      : undefined,
    allowedCategories: mandate.allowedCategories
      ? [...mandate.allowedCategories]
      : undefined,
  }
}
