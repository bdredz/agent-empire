import {
  AgentId,
  Budget,
  BudgetCheckResult,
  BudgetUsage,
} from '@shared/types'

export interface IBudgetGovernor {
  allocate(agentId: AgentId, budget: Budget): void
  recordUsage(agentId: AgentId, usage: Partial<BudgetUsage>): void
  checkBudget(agentId: AgentId): BudgetCheckResult
  tripCircuitBreaker(agentId: AgentId, reason: string): void
  getUsage(agentId: AgentId): BudgetUsage
}
