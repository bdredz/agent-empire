import type { DispatcherState, EscalationReason, PlanEnvelope, WorkflowCheckpoint } from '@shared/types'
import type { ICheckpointStore } from './ICheckpointStore'
import { getReadyNodeIds } from '@orchestrator/runtimeState'

export interface WorkflowResumeResult {
  resumed: boolean
  dispatcherState?: DispatcherState
  readyNodeIds: string[]
  escalationReason?: EscalationReason
}

export class WorkflowResumer {
  constructor(private readonly checkpointStore: ICheckpointStore) {}

  public async resume(planId: string, envelope: PlanEnvelope): Promise<WorkflowResumeResult> {
    const checkpoint = await this.checkpointStore.load(planId)
    if (!checkpoint) {
      return { resumed: false, readyNodeIds: [] }
    }

    const validationError = validateCheckpoint(checkpoint, envelope)
    if (validationError) {
      return {
        resumed: false,
        readyNodeIds: [],
        escalationReason: 'durability_fault',
      }
    }

    const rehydrated = rehydrateState(checkpoint.dispatcherState)
    const readyNodeIds = getReadyNodeIds(envelope, rehydrated)

    return {
      resumed: true,
      dispatcherState: rehydrated,
      readyNodeIds,
    }
  }
}

function validateCheckpoint(checkpoint: WorkflowCheckpoint, envelope: PlanEnvelope): string | null {
  if (checkpoint.planId !== envelope.planId) {
    return 'plan_mismatch'
  }
  if (checkpoint.tenantId !== envelope.tenantId) {
    return 'tenant_mismatch'
  }
  if (checkpoint.dispatcherState.planId !== envelope.planId) {
    return 'state_plan_mismatch'
  }
  if (!Array.isArray(checkpoint.dispatcherState.completedNodeIds)) {
    return 'invalid_completed_nodes'
  }
  return null
}

function rehydrateState(state: DispatcherState): DispatcherState {
  const failedNodeIds: string[] = []
  const retryCounts = { ...state.retryCounts }

  for (const failedNodeId of state.failedNodeIds) {
    retryCounts[failedNodeId] = Math.max(retryCounts[failedNodeId] ?? 0, 1)
  }

  return {
    ...state,
    failedNodeIds,
    retryCounts,
    activeNodeIds: [],
    executionStatus: state.executionStatus === 'hibernated' ? 'hibernated' : 'running',
  }
}
