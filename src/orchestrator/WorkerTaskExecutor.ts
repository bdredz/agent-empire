import type { TaskExecutor, NodeExecutionResult } from './IJarvis'
import type { TaskDAG } from './TaskDAG'
import type { IWorker, WorkerResult } from '@workers/IWorker'
import type { EvalPipeline } from '@eval/EvalPipeline'
import type { IBudgetGovernor } from '@governor/IBudgetGovernor'
import type { EvalInput } from '@eval/IEvaluator'
import type { ILibrarian } from '@librarian/ILibrarian'
import type { ICheckpointStore } from '../runtime/checkpoints/ICheckpointStore'
import {
  type AgentId,
  type TaskInputs,
  type TaskSpec,
  type OutputSchema,
  type RetryPolicy,
  type SuccessCriteria,
  EvalMethod,
  EvalOutcome,
} from '@shared/types'

export type WorkerRegistry = ReadonlyMap<string, IWorker>

type WorkerExecutionResult =
  | { success: true; workerResult: WorkerResult }
  | { success: false; errorMessage: string }

export class WorkerTaskExecutor implements TaskExecutor {
  constructor(
    private readonly governor: IBudgetGovernor,
    private readonly evalPipeline: EvalPipeline,
    private readonly workerRegistry: WorkerRegistry,
    private readonly governorAgentId?: AgentId,
    private readonly librarian?: ILibrarian,
    private readonly checkpointStore?: ICheckpointStore,
  ) {}

  public async executeNode(dag: TaskDAG, nodeIndex: number): Promise<NodeExecutionResult> {
    if (nodeIndex < 0 || nodeIndex >= dag.nodes.length) {
      return { success: false, errorMessage: `Invalid node index: ${nodeIndex} (DAG has ${dag.nodes.length} nodes)` }
    }

    const node = dag.nodes[nodeIndex]!
    const worker = this.workerRegistry.get(node.assignedRole)
    if (!worker) {
      return { success: false, errorMessage: `No worker registered for role: ${node.assignedRole}` }
    }

    const execution = await this.runWorker(worker, this.buildTaskSpec(node))
    if (!execution.success) {
      await this.saveCheckpoint(dag, node.taskId as string, 'failed', execution.errorMessage)
      return { success: false, errorMessage: execution.errorMessage }
    }

    if (execution.workerResult.memoryProposals && execution.workerResult.memoryProposals.length > 0) {
      const routingError = await this.routeMemoryProposals(execution.workerResult)
      if (routingError) {
        await this.saveCheckpoint(dag, node.taskId as string, 'failed', routingError)
        return { success: false, errorMessage: routingError }
      }
    }

    this.recordBudget(execution.workerResult.usage)

    try {
      const pipelineResult = await this.evalPipeline.evaluate(this.buildEvalInput(dag, node, execution.workerResult))
      const passed = pipelineResult.finalResult.outcome === EvalOutcome.Pass
      await this.saveCheckpoint(dag, node.taskId as string, passed ? 'completed' : 'failed')

      return {
        success: passed,
        evalResult: pipelineResult.finalResult,
        errorMessage: passed ? undefined : `Eval failed at stage: ${pipelineResult.stage}`,
      }
    } catch (err) {
      const message = `Eval pipeline error: ${err instanceof Error ? err.message : 'Unknown error'}`
      await this.saveCheckpoint(dag, node.taskId as string, 'failed', message)
      return { success: false, errorMessage: message }
    }
  }

  private async runWorker(worker: IWorker, taskSpec: TaskSpec): Promise<WorkerExecutionResult> {
    try {
      const workerResult = await worker.execute(taskSpec)
      if (!workerResult.success) {
        return { success: false, errorMessage: workerResult.errors?.join('; ') ?? 'Worker returned failure' }
      }
      return { success: true, workerResult }
    } catch (err) {
      return { success: false, errorMessage: `Worker execution failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  }

  private async routeMemoryProposals(workerResult: WorkerResult): Promise<string | null> {
    if (!this.librarian) {
      return 'Worker emitted memory proposals but no Librarian is configured'
    }

    const librarian = this.librarian
    try {
      await Promise.all((workerResult.memoryProposals ?? []).map((proposal) => librarian.submitProposal(proposal)))
      return null
    } catch (err) {
      return `Memory proposal routing failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }

  private recordBudget(usage: WorkerResult['usage']): void {
    if (!this.governorAgentId) {
      return
    }

    try {
      this.governor.recordUsage(this.governorAgentId, usage)
    } catch {
      return
    }
  }

  private async saveCheckpoint(dag: TaskDAG, nodeId: string, status: 'completed' | 'failed', errorMessage?: string): Promise<void> {
    if (!this.checkpointStore) {
      return
    }

    const now = new Date().toISOString()
    await this.checkpointStore.save({
      checkpointId: `${dag.goalId}:${nodeId}:${Date.now()}`,
      planId: dag.goalId,
      tenantId: 'default-tenant',
      status,
      dispatcherState: {
        planId: dag.goalId,
        tenantId: 'default-tenant',
        activeNodeIds: [],
        completedNodeIds: status === 'completed' ? [nodeId] : [],
        failedNodeIds: status === 'failed' ? [nodeId] : [],
        retryCounts: {},
        waitingNodeIds: [],
        executionStatus: status,
      },
      serializedNodeStates: { [nodeId]: status, errorMessage },
      createdAt: now,
      updatedAt: now,
    })
  }

  private buildEvalInput(dag: TaskDAG, node: TaskDAG['nodes'][number], workerResult: WorkerResult): EvalInput {
    return {
      taskType: node.assignedRole,
      artifacts: workerResult.artifacts,
      output: workerResult.output,
      metadata: { nodeId: node.taskId, nodeName: node.name, goalId: dag.goalId },
    }
  }

  private buildTaskSpec(node: TaskDAG['nodes'][number]): TaskSpec {
    const inputs: TaskInputs = { artifactRefs: [], parameters: { description: node.description, role: node.assignedRole } }
    const expectedOutputs: OutputSchema[] = [{ name: 'result', format: 'json' }]
    const successCriteria: SuccessCriteria = { description: `Complete: ${node.name}`, evalMethod: EvalMethod.Deterministic }
    const retryPolicy: RetryPolicy = { maxAttempts: 3, backoffMs: 1000, jitter: true, escalateAfter: 2 }

    return {
      taskId: node.taskId,
      taskType: node.assignedRole,
      inputs,
      expectedOutputs,
      successCriteria,
      retryPolicy,
      priority: node.priority,
    }
  }
}
