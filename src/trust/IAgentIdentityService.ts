import { AgentId, AgentIdentity, AgentRole } from '@shared/types'

export interface IssueAgentIdentityParams {
  tenantId: string
  ownerId: string
  ownerType: AgentIdentity['ownerType']
  role: AgentRole
  businessUnitId?: string
}

export interface IAgentIdentityService {
  issue(params: IssueAgentIdentityParams): Promise<AgentIdentity>
  get(agentId: AgentId): Promise<AgentIdentity | null>
  verify(agentId: AgentId): Promise<AgentIdentity>
  restrict(agentId: AgentId, reason: string): Promise<AgentIdentity>
  revoke(agentId: AgentId, reason: string): Promise<AgentIdentity>
  bindWallet(agentId: AgentId, walletId: string): Promise<AgentIdentity>
  listByTenant(tenantId: string): Promise<AgentIdentity[]>
}
