import type {
  DispatcherState,
  EscalationPolicy,
  EscalationReason,
  ExecutionStatus,
  PlanEnvelope,
} from '@shared/types'

const TERMINAL_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'completed',
  'failed',
  'escalated',
])

export function createDispatcherState(envelope: PlanEnvelope): DispatcherState {
  return {
    planId: envelope.planId,
    tenantId: envelope.tenantId,
    activeNodeIds: [],
    completedNodeIds: [],
    failedNodeIds: [],
    retryCounts: {},
    waitingNodeIds: [],
    executionStatus: 'planned',
  }
}

export function setExecutionStatus(
  state: DispatcherState,
  status: ExecutionStatus,
): DispatcherState {
  return { ...state, executionStatus: status }
}

export function markNodeRunning(state: DispatcherState, nodeId: string): DispatcherState {
  return {
    ...state,
    activeNodeIds: pushUnique(state.activeNodeIds, nodeId),
    waitingNodeIds: removeValue(state.waitingNodeIds, nodeId),
    executionStatus: 'running',
  }
}

export function markNodeWaiting(state: DispatcherState, nodeId: string): DispatcherState {
  return {
    ...state,
    waitingNodeIds: pushUnique(state.waitingNodeIds, nodeId),
    activeNodeIds: removeValue(state.activeNodeIds, nodeId),
    executionStatus: 'waiting',
  }
}

export function markNodeCompleted(state: DispatcherState, nodeId: string): DispatcherState {
  return {
    ...state,
    activeNodeIds: removeValue(state.activeNodeIds, nodeId),
    waitingNodeIds: removeValue(state.waitingNodeIds, nodeId),
    failedNodeIds: removeValue(state.failedNodeIds, nodeId),
    completedNodeIds: pushUnique(state.completedNodeIds, nodeId),
  }
}

export function markNodeFailed(state: DispatcherState, nodeId: string): DispatcherState {
  return {
    ...state,
    activeNodeIds: removeValue(state.activeNodeIds, nodeId),
    waitingNodeIds: removeValue(state.waitingNodeIds, nodeId),
    failedNodeIds: pushUnique(state.failedNodeIds, nodeId),
    completedNodeIds: removeValue(state.completedNodeIds, nodeId),
    executionStatus: 'retrying',
  }
}

export function incrementRetryCount(state: DispatcherState, nodeId: string): DispatcherState {
  const current = state.retryCounts[nodeId] ?? 0
  return {
    ...state,
    retryCounts: {
      ...state.retryCounts,
      [nodeId]: current + 1,
    },
  }
}

export function canRetryNode(
  state: DispatcherState,
  nodeId: string,
  policy: EscalationPolicy,
): boolean {
  return (state.retryCounts[nodeId] ?? 0) < policy.maxRetriesPerNode
}

export function markEscalated(
  state: DispatcherState,
  reason: EscalationReason,
): DispatcherState {
  return {
    ...state,
    executionStatus: 'escalated',
    lastEscalationReason: reason,
    activeNodeIds: [],
  }
}

export function getReadyNodeIds(
  envelope: PlanEnvelope,
  state: DispatcherState,
): string[] {
  if (TERMINAL_STATUSES.has(state.executionStatus)) {
    return []
  }

  const completed = new Set(state.completedNodeIds)
  const failed = new Set(state.failedNodeIds)
  const active = new Set(state.activeNodeIds)
  const waiting = new Set(state.waitingNodeIds)

  return envelope.taskDag.nodes
    .map((node) => node.taskId as string)
    .filter((nodeId, index) => {
      if (completed.has(nodeId) || failed.has(nodeId) || active.has(nodeId) || waiting.has(nodeId)) {
        return false
      }

      const dependencies = envelope.taskDag.nodes[index]?.dependencies ?? []
      return dependencies.every((depId) => completed.has(depId as string))
    })
}

export function isPlanCompleted(envelope: PlanEnvelope, state: DispatcherState): boolean {
  return envelope.taskDag.nodes.length === state.completedNodeIds.length
}

export function isDependencyDeadlocked(
  envelope: PlanEnvelope,
  state: DispatcherState,
): boolean {
  const totalNodes = envelope.taskDag.nodes.length
  const resolved = state.completedNodeIds.length + state.failedNodeIds.length
  const unresolved = totalNodes - resolved

  if (unresolved <= 0) {
    return false
  }

  if (state.activeNodeIds.length > 0 || state.waitingNodeIds.length > 0) {
    return false
  }

  return getReadyNodeIds(envelope, state).length === 0
}

function pushUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value]
}

function removeValue(values: string[], value: string): string[] {
  return values.filter((entry) => entry !== value)
}
