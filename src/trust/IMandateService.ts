import { AgentId, Mandate, MandateId } from '@shared/types'

export interface MandateValidationAction {
  amount?: number
  merchant?: string
  category?: string
}

export interface MandateValidationResult {
  valid: boolean
  reason?: string
}

export interface IMandateService {
  create(params: Omit<Mandate, 'mandateId' | 'status' | 'createdAt'>): Promise<Mandate>
  get(mandateId: MandateId): Promise<Mandate | null>
  validate(
    mandateId: MandateId,
    action: MandateValidationAction,
  ): Promise<MandateValidationResult>
  revoke(mandateId: MandateId): Promise<Mandate>
  consume(mandateId: MandateId): Promise<Mandate>
  listByAgent(agentId: AgentId): Promise<Mandate[]>
  listActive(tenantId: string): Promise<Mandate[]>
}
