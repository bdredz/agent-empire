import type { WorkflowCheckpoint } from '@shared/types'

export interface ICheckpointStore {
  save(checkpoint: WorkflowCheckpoint): Promise<void>
  load(planId: string): Promise<WorkflowCheckpoint | null>
  list(tenantId: string): Promise<WorkflowCheckpoint[]>
  delete(checkpointId: string): Promise<void>
}
