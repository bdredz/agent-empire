import type { TaskExecutor, NodeExecutionResult } from './IJarvis'
import type { TaskDAG } from './TaskDAG'
import type { IWorker, WorkerResult } from '@workers/IWorker'
import type { EvalPipeline } from '@eval/EvalPipeline'
import type { IBudgetGovernor } from '@governor/IBudgetGovernor'
import type { EvalInput } from '@eval/IEvaluator'
import type { ILibrarian } from '@librarian/ILibrarian'
import {
    type AgentId,
    type TaskSpec,
    type TaskInputs,
    type OutputSchema,
    type SuccessCriteria,
    type RetryPolicy,
    AgentRole,
    EvalMethod,
    EvalOutcome,
    createTaskId,
} from '@shared/types'

// ---------------------------------------------------------------------------
// Worker registry — maps AgentRole → IWorker
// ---------------------------------------------------------------------------

export type WorkerRegistry = ReadonlyMap<string, IWorker>

// ---------------------------------------------------------------------------
// WorkerTaskExecutor — routes DAG nodes to Workers, evaluates, records budget
// ---------------------------------------------------------------------------

export class WorkerTaskExecutor implements TaskExecutor {
    constructor(
        private readonly governor: IBudgetGovernor,
        private readonly evalPipeline: EvalPipeline,
        private readonly workerRegistry: WorkerRegistry,
        private readonly governorAgentId?: AgentId,
        private readonly librarian?: ILibrarian,
    ) { }

    async executeNode(dag: TaskDAG, nodeIndex: number): Promise<NodeExecutionResult> {
        // Validate node index
        if (nodeIndex < 0 || nodeIndex >= dag.nodes.length) {
            return {
                success: false,
                errorMessage: `Invalid node index: ${nodeIndex} (DAG has ${dag.nodes.length} nodes)`,
            }
        }

        const node = dag.nodes[nodeIndex]!

        // Look up worker by assigned role
        const worker = this.workerRegistry.get(node.assignedRole)
        if (!worker) {
            return {
                success: false,
                errorMessage: `No worker registered for role: ${node.assignedRole}`,
            }
        }

        // Build TaskSpec from DAG node
        const taskSpec = this.buildTaskSpec(node)

        // Execute worker
        let workerResult: WorkerResult
        try {
            workerResult = await worker.execute(taskSpec)
        } catch (err) {
            return {
                success: false,
                errorMessage: `Worker execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            }
        }

        if (!workerResult.success) {
            return {
                success: false,
                errorMessage: workerResult.errors?.join('; ') ?? 'Worker returned failure',
            }
        }

        if (workerResult.memoryProposals && workerResult.memoryProposals.length > 0) {
            if (!this.librarian) {
                return {
                    success: false,
                    errorMessage: 'Worker emitted memory proposals but no Librarian is configured',
                }
            }

            const librarian = this.librarian
            try {
                await Promise.all(workerResult.memoryProposals.map((proposal) => librarian.submitProposal(proposal)))
            } catch (err) {
                return {
                    success: false,
                    errorMessage: `Memory proposal routing failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
                }
            }
        }

        // Record budget usage on governor
        if (this.governorAgentId) {
            try {
                this.governor.recordUsage(this.governorAgentId, workerResult.usage)
            } catch {
                // Budget recording failure should not block task result
            }
        }

        // Run eval pipeline on worker output
        const evalInput: EvalInput = {
            taskType: node.assignedRole,
            artifacts: workerResult.artifacts,
            output: workerResult.output,
            metadata: {
                nodeId: node.taskId,
                nodeName: node.name,
                goalId: dag.goalId,
            },
        }

        try {
            const pipelineResult = await this.evalPipeline.evaluate(evalInput)
            const passed = pipelineResult.finalResult.outcome === EvalOutcome.Pass

            return {
                success: passed,
                evalResult: pipelineResult.finalResult,
                errorMessage: passed ? undefined : `Eval failed at stage: ${pipelineResult.stage}`,
            }
        } catch (err) {
            return {
                success: false,
                errorMessage: `Eval pipeline error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            }
        }
    }

    private buildTaskSpec(node: import('./TaskDAG').DAGNode): TaskSpec {
        const inputs: TaskInputs = {
            artifactRefs: [],
            parameters: {
                description: node.description,
                role: node.assignedRole,
            },
        }

        const expectedOutputs: OutputSchema[] = [
            {
                name: 'result',
                format: 'json',
            },
        ]

        const successCriteria: SuccessCriteria = {
            description: `Complete: ${node.name}`,
            evalMethod: EvalMethod.Deterministic,
        }

        const retryPolicy: RetryPolicy = {
            maxAttempts: 3,
            backoffMs: 1000,
            jitter: true,
            escalateAfter: 2,
        }

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
