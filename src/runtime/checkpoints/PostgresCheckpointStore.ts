import type { WorkflowCheckpoint } from '@shared/types'
import type { ICheckpointStore } from './ICheckpointStore'

interface PostgresCheckpointRecord {
  checkpointId: string
  planId: string
  tenantId: string
  payload: string
}

export interface PostgresCheckpointDb {
  upsert(record: PostgresCheckpointRecord): Promise<void>
  findByPlanId(planId: string): Promise<PostgresCheckpointRecord | null>
  listByTenant(tenantId: string): Promise<PostgresCheckpointRecord[]>
  deleteByCheckpointId(checkpointId: string): Promise<void>
}

export class PostgresCheckpointStore implements ICheckpointStore {
  constructor(private readonly db: PostgresCheckpointDb) {}

  public async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    await this.db.upsert({
      checkpointId: checkpoint.checkpointId,
      planId: checkpoint.planId,
      tenantId: checkpoint.tenantId,
      payload: JSON.stringify(checkpoint),
    })
  }

  public async load(planId: string): Promise<WorkflowCheckpoint | null> {
    const row = await this.db.findByPlanId(planId)
    if (!row) {
      return null
    }
    return JSON.parse(row.payload) as WorkflowCheckpoint
  }

  public async list(tenantId: string): Promise<WorkflowCheckpoint[]> {
    const rows = await this.db.listByTenant(tenantId)
    return rows.map((row) => JSON.parse(row.payload) as WorkflowCheckpoint)
  }

  public async delete(checkpointId: string): Promise<void> {
    await this.db.deleteByCheckpointId(checkpointId)
  }
}
