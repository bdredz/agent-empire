import { ModelTier, Capability, TaskSpec, ArtifactId, BudgetUsage } from '@shared/types'

export interface IWorker {
  readonly name: string
  readonly modelTier: ModelTier
  readonly capabilities: Capability[]
  execute(spec: TaskSpec): Promise<WorkerResult>
}

export interface WorkerResult {
  readonly success: boolean
  readonly artifacts: ArtifactId[]
  readonly output: unknown  // typed per worker
  readonly usage: BudgetUsage
  readonly errors?: string[]
}
