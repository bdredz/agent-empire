import {
  AgentHandle,
  AgentId,
  AgentRole,
  AgentStatus,
  CreateAgentRequest,
} from '@shared/types'

// ---------------------------------------------------------------------------
// Factory Result Types
// ---------------------------------------------------------------------------

export interface FactorySuccess<T> {
  readonly ok: true
  readonly value: T
}

export interface FactoryError {
  readonly ok: false
  readonly error: FactoryErrorCode
  readonly message: string
}

export type FactoryResult<T> = FactorySuccess<T> | FactoryError

export type FactoryErrorCode =
  | 'BUDGET_EXCEEDS_PARENT'
  | 'TOOLS_NOT_IN_PARENT_BUNDLE'
  | 'MAX_DEPTH_EXCEEDED'
  | 'SPAWN_NOT_ALLOWED'
  | 'DISALLOWED_ROLE'
  | 'INVALID_REQUEST'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_ALREADY_TERMINATED'
  | 'CONCURRENT_CONFLICT'

// ---------------------------------------------------------------------------
// Termination Receipt
// ---------------------------------------------------------------------------

export interface TerminationReceipt {
  readonly agentId: AgentId
  readonly terminatedAt: string
  readonly reason: string
  readonly finalStatus: AgentStatus
}

// ---------------------------------------------------------------------------
// Agent Filter
// ---------------------------------------------------------------------------

export interface AgentFilter {
  readonly role?: AgentRole
  readonly status?: AgentStatus
  readonly parentAgentId?: AgentId
}

// ---------------------------------------------------------------------------
// Factory Interface
// ---------------------------------------------------------------------------

export interface IAgentFactory {
  createAgent(request: CreateAgentRequest): Promise<FactoryResult<AgentHandle>>
  terminateAgent(agentId: AgentId, reason: string): Promise<FactoryResult<TerminationReceipt>>
  getAgent(agentId: AgentId): Promise<AgentHandle | null>
  listAgents(filter?: AgentFilter): Promise<AgentHandle[]>
}
