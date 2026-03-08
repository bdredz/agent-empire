import type { IBudgetGovernor } from '@governor/IBudgetGovernor'
import type { TaskExecutor } from './IJarvis'
import type {
  AgentId,
  BudgetCheckResult,
  DispatcherState,
  EscalationPolicy,
  EscalationReason,
  PlanEnvelope,
} from '@shared/types'
import { EvalOutcome } from '@shared/types'
import {
  canRetryNode,
  getReadyNodeIds,
  incrementRetryCount,
  isDependencyDeadlocked,
  isPlanCompleted,
  markNodeCompleted,
  markNodeFailed,
  markNodeRetryPending,
  markNodeRunning,
  markNodeWaiting,
  setExecutionStatus,
} from './runtimeState'

export interface DispatcherRunnerDeps {
  taskExecutor: TaskExecutor
  governor: IBudgetGovernor
  envelope: PlanEnvelope
  maxConcurrentNodes: number
  getState: () => DispatcherState
  persistState: (state: DispatcherState) => Promise<void>
  escalate: (reason: EscalationReason) => Promise<void>
  isPaused: () => boolean
  toGovernorAgentId: (planId: string) => AgentId
}

export async function runDispatcherPlan(deps: DispatcherRunnerDeps): Promise<void> {
  while (true) {
    const state = deps.getState()
    if (deps.isPaused()) {
      await deps.persistState(setExecutionStatus(state, 'waiting'))
      return
    }
    if (isPlanCompleted(deps.envelope, state)) {
      await deps.persistState(setExecutionStatus(state, 'completed'))
      return
    }
    if (isDependencyDeadlocked(deps.envelope, state)) {
      await deps.escalate('dependency_deadlock')
      return
    }

    const readyNodeIds = getReadyNodeIds(deps.envelope, state).slice(0, deps.maxConcurrentNodes)
    if (readyNodeIds.length === 0) {
      if (state.waitingNodeIds.length > 0) {
        if (state.executionStatus !== 'hibernated') {
          await deps.persistState(setExecutionStatus(state, 'waiting'))
        }
      }
      return
    }

    await deps.persistState(setExecutionStatus(state, 'dispatching'))
    const shouldContinue = await executeBatch(deps, readyNodeIds)
    if (!shouldContinue) {
      return
    }
  }
}

async function executeBatch(deps: DispatcherRunnerDeps, nodeIds: string[]): Promise<boolean> {
  const nodeResults = await Promise.all(nodeIds.map((nodeId) => executeNode(deps, nodeId)))

  for (const nodeResult of nodeResults) {
    const state = deps.getState()
    if (nodeResult.classification === 'success') {
      await deps.persistState(markNodeCompleted(state, nodeResult.nodeId))
      continue
    }
    if (nodeResult.classification === 'wait' || nodeResult.classification === 'hibernate') {
      const waiting = markNodeWaiting(state, nodeResult.nodeId)
      await deps.persistState(
        nodeResult.classification === 'hibernate' ? setExecutionStatus(waiting, 'hibernated') : waiting,
      )
      continue
    }
    if (nodeResult.classification === 'unsafe' && deps.envelope.escalationPolicy.escalateOnMechanicUnsafeAction) {
      await deps.escalate('unsafe_action')
      return false
    }
    if (nodeResult.classification === 'eval_fail' && deps.envelope.escalationPolicy.escalateOnEvalFailure) {
      await deps.escalate('eval_failure')
      return false
    }

    const failed = incrementRetryCount(markNodeFailed(state, nodeResult.nodeId), nodeResult.nodeId)
    if (!canRetryNode(failed, nodeResult.nodeId, deps.envelope.escalationPolicy)) {
      await deps.persistState(failed)
      await deps.escalate('node_retry_limit')
      return false
    }
    await deps.persistState(markNodeRetryPending(failed, nodeResult.nodeId))
  }

  const budget = safeBudgetCheck(deps.governor, deps.toGovernorAgentId(deps.envelope.planId))
  if (!budget.withinLimits && deps.envelope.escalationPolicy.escalateOnBudgetTrip) {
    await deps.escalate('budget_trip')
    return false
  }

  return true
}

async function executeNode(
  deps: DispatcherRunnerDeps,
  nodeId: string,
): Promise<{ nodeId: string; classification: ExecutionClassification }> {
  await deps.persistState(markNodeRunning(deps.getState(), nodeId))
  const nodeIndex = deps.envelope.taskDag.nodes.findIndex((node) => (node.taskId as string) === nodeId)
  const result = await deps.taskExecutor.executeNode(deps.envelope.taskDag, nodeIndex)
  return { nodeId, classification: classifyResult(result.errorMessage, result.evalResult?.outcome) }
}

type ExecutionClassification = 'success' | 'wait' | 'hibernate' | 'unsafe' | 'eval_fail' | 'failed'

function classifyResult(errorMessage?: string, outcome?: string): ExecutionClassification {
  if (!errorMessage) {
    return 'success'
  }
  const lower = errorMessage.toLowerCase()
  if (lower.startsWith('wait:')) return 'wait'
  if (lower.includes('hibernate') || lower.includes('infra_outage')) return 'hibernate'
  if (lower.includes('unsafe action')) return 'unsafe'
  if (outcome === EvalOutcome.Fail) return 'eval_fail'
  return 'failed'
}

function safeBudgetCheck(governor: IBudgetGovernor, agentId: AgentId): BudgetCheckResult {
  try {
    return governor.checkBudget(agentId)
  } catch {
    return { withinLimits: true, warnings: [], exceeded: [] }
  }
}

export function serializeNodeStates(envelope: PlanEnvelope, state: DispatcherState): Record<string, unknown> {
  return envelope.taskDag.nodes.reduce<Record<string, string>>((acc, node) => {
    const nodeId = node.taskId as string
    if (state.completedNodeIds.includes(nodeId)) acc[nodeId] = 'completed'
    else if (state.failedNodeIds.includes(nodeId)) acc[nodeId] = 'failed'
    else if (state.waitingNodeIds.includes(nodeId)) acc[nodeId] = 'waiting'
    else if (state.activeNodeIds.includes(nodeId)) acc[nodeId] = 'running'
    else acc[nodeId] = 'pending'
    return acc
  }, {})
}
