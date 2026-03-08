import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkerTaskExecutor, type WorkerRegistry } from './WorkerTaskExecutor'
import type { IWorker, WorkerResult } from '@workers/IWorker'
import type { IBudgetGovernor } from '@governor/IBudgetGovernor'
import type { EvalPipeline } from '@eval/EvalPipeline'
import type { TaskDAG, DAGNode } from './TaskDAG'
import { DAGNodeStatus } from './TaskDAG'
import type { ILibrarian } from '@librarian/ILibrarian'
import {
    AgentRole,
    ModelTier,
    Capability,
    EvalOutcome,
    TaskPriority,
    createAgentId,
    createTaskId,
} from '@shared/types'
import type { PipelineResult } from '@eval/IEvaluator'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<DAGNode> = {}): DAGNode {
    return {
        taskId: createTaskId('test-task-1'),
        name: 'Test task',
        description: 'Do the thing',
        assignedRole: AgentRole.Worker,
        dependencies: [],
        priority: TaskPriority.Normal,
        status: DAGNodeStatus.Pending,
        ...overrides,
    }
}

function makeDAG(nodes: DAGNode[]): TaskDAG {
    return {
        goalId: 'goal-123',
        goalDescription: 'Test goal',
        nodes,
        createdAt: new Date().toISOString(),
    }
}

function makeWorkerResult(overrides: Partial<WorkerResult> = {}): WorkerResult {
    return {
        success: true,
        artifacts: [],
        output: { data: 'result' },
        usage: { tokensUsed: 100, toolCallsUsed: 5, wallTimeElapsedSec: 2, costUnitsUsed: 0.01 },
        ...overrides,
    }
}

function makePassingPipelineResult(): PipelineResult {
    return {
        finalResult: {
            outcome: EvalOutcome.Pass,
            reasoning: 'Looks good',
            evaluatorId: 'test-eval',
            timestamp: new Date().toISOString(),
        },
        stage: 'deterministic',
        stageResults: [],
        totalAttempts: 1,
    }
}

function makeFailingPipelineResult(): PipelineResult {
    return {
        finalResult: {
            outcome: EvalOutcome.Fail,
            reasoning: 'Quality too low',
            evaluatorId: 'test-eval',
            timestamp: new Date().toISOString(),
        },
        stage: 'llm_critic',
        stageResults: [],
        totalAttempts: 3,
    }
}

function createMockWorker(): IWorker {
    return {
        name: 'test-worker',
        modelTier: ModelTier.Fast,
        capabilities: [Capability.DataTransform],
        execute: vi.fn().mockResolvedValue(makeWorkerResult()),
    }
}

function createMockGovernor(): IBudgetGovernor {
    return {
        allocate: vi.fn(),
        recordUsage: vi.fn(),
        checkBudget: vi.fn().mockReturnValue({ withinLimits: true, warnings: [], exceeded: [] }),
        tripCircuitBreaker: vi.fn(),
        getUsage: vi.fn().mockReturnValue({ tokensUsed: 0, toolCallsUsed: 0, wallTimeElapsedSec: 0, costUnitsUsed: 0 }),
    }
}

function createMockEvalPipeline(result: PipelineResult): EvalPipeline {
    return {
        evaluate: vi.fn().mockResolvedValue(result),
    } as unknown as EvalPipeline
}

function createMockLibrarian(): ILibrarian {
    return {
        ingest: vi.fn(),
        query: vi.fn(),
        prune: vi.fn(),
        resolveConflict: vi.fn(),
        submitProposal: vi.fn().mockResolvedValue({ accepted: true, entryId: 'entry-1' }),
        queryV2: vi.fn(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerTaskExecutor', () => {
    let mockWorker: IWorker
    let mockGovernor: IBudgetGovernor
    let mockEvalPipeline: EvalPipeline
    let registry: WorkerRegistry
    let agentId = createAgentId('agent-test')

    beforeEach(() => {
        mockWorker = createMockWorker()
        mockGovernor = createMockGovernor()
        mockEvalPipeline = createMockEvalPipeline(makePassingPipelineResult())
        registry = new Map([[AgentRole.Worker, mockWorker]])
    })

    it('executes successfully through full pipeline', async () => {
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, registry, agentId)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 0)

        expect(result.success).toBe(true)
        expect(result.evalResult).toBeDefined()
        expect(result.evalResult?.outcome).toBe(EvalOutcome.Pass)
        expect(mockWorker.execute).toHaveBeenCalledOnce()
    })

    it('returns failure when worker is not found for role', async () => {
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, registry, agentId)
        const node = makeNode({ assignedRole: AgentRole.Researcher })
        const dag = makeDAG([node])

        const result = await executor.executeNode(dag, 0)

        expect(result.success).toBe(false)
        expect(result.errorMessage).toContain('No worker registered for role')
    })

    it('returns failure when eval pipeline rejects output', async () => {
        const failEval = createMockEvalPipeline(makeFailingPipelineResult())
        const executor = new WorkerTaskExecutor(mockGovernor, failEval, registry, agentId)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 0)

        expect(result.success).toBe(false)
        expect(result.errorMessage).toContain('Eval failed at stage')
        expect(result.evalResult?.outcome).toBe(EvalOutcome.Fail)
    })

    it('records budget usage via governor', async () => {
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, registry, agentId)
        const dag = makeDAG([makeNode()])

        await executor.executeNode(dag, 0)

        expect(mockGovernor.recordUsage).toHaveBeenCalledWith(
            agentId,
            expect.objectContaining({ tokensUsed: 100, toolCallsUsed: 5 })
        )
    })

    it('returns failure when worker execution throws', async () => {
        const throwingWorker: IWorker = {
            name: 'bad-worker',
            modelTier: ModelTier.Fast,
            capabilities: [],
            execute: vi.fn().mockRejectedValue(new Error('Kaboom')),
        }
        const throwRegistry: WorkerRegistry = new Map([[AgentRole.Worker, throwingWorker]])
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, throwRegistry, agentId)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 0)

        expect(result.success).toBe(false)
        expect(result.errorMessage).toContain('Worker execution failed')
        expect(result.errorMessage).toContain('Kaboom')
    })

    it('returns failure when worker returns success: false', async () => {
        const failWorker: IWorker = {
            name: 'fail-worker',
            modelTier: ModelTier.Fast,
            capabilities: [],
            execute: vi.fn().mockResolvedValue(makeWorkerResult({ success: false, errors: ['Bad input'] })),
        }
        const failRegistry: WorkerRegistry = new Map([[AgentRole.Worker, failWorker]])
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, failRegistry, agentId)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 0)

        expect(result.success).toBe(false)
        expect(result.errorMessage).toContain('Bad input')
    })

    it('returns failure for invalid node index', async () => {
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, registry, agentId)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 5)

        expect(result.success).toBe(false)
        expect(result.errorMessage).toContain('Invalid node index')
    })

    it('handles eval pipeline error gracefully', async () => {
        const crashingEval = {
            evaluate: vi.fn().mockRejectedValue(new Error('Eval crashed')),
        } as unknown as EvalPipeline
        const executor = new WorkerTaskExecutor(mockGovernor, crashingEval, registry, agentId)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 0)

        expect(result.success).toBe(false)
        expect(result.errorMessage).toContain('Eval pipeline error')
    })

    it('continues when governor recordUsage throws', async () => {
        const throwingGovernor = createMockGovernor()
        throwingGovernor.recordUsage = vi.fn().mockImplementation(() => {
            throw new Error('Governor broken')
        })
        const executor = new WorkerTaskExecutor(throwingGovernor, mockEvalPipeline, registry, agentId)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 0)

        // Should still succeed — budget recording failure is non-blocking
        expect(result.success).toBe(true)
        expect(throwingGovernor.recordUsage).toHaveBeenCalled()
    })

    it('skips budget recording when no governorAgentId provided', async () => {
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, registry)
        const dag = makeDAG([makeNode()])

        await executor.executeNode(dag, 0)

        expect(mockGovernor.recordUsage).not.toHaveBeenCalled()
    })

    it('passes correct eval input with metadata', async () => {
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, registry, agentId)
        const node = makeNode({ name: 'Special task' })
        const dag = makeDAG([node])

        await executor.executeNode(dag, 0)

        const evalCall = (mockEvalPipeline.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]!
        const evalInput = evalCall[0] as Record<string, unknown>
        expect(evalInput).toMatchObject({
            taskType: AgentRole.Worker,
            artifacts: [],
            output: { data: 'result' },
        })
        const metadata = evalInput.metadata as Record<string, unknown>
        expect(metadata.nodeName).toBe('Special task')
        expect(metadata.goalId).toBe('goal-123')
    })

    it('routes worker memory proposals through librarian', async () => {
        const workerWithProposal: IWorker = {
            ...createMockWorker(),
            execute: vi.fn().mockResolvedValue(makeWorkerResult({
                memoryProposals: [{
                    proposalId: 'proposal-1',
                    tenantId: 'tenant-1',
                    sourceAgentId: 'agent-worker',
                    kind: 'observation',
                    title: 'Observed issue',
                    rawContent: 'Dispatcher retries twice before escalate.',
                    summary: 'retry policy observation',
                    tags: ['runtime'],
                    confidence: 0.8,
                    createdAt: new Date().toISOString(),
                }],
            })),
        }
        const workerRegistry: WorkerRegistry = new Map([[AgentRole.Worker, workerWithProposal]])
        const librarian = createMockLibrarian()
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, workerRegistry, agentId, librarian)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 0)

        expect(result.success).toBe(true)
        expect(librarian.submitProposal).toHaveBeenCalledOnce()
    })

    it('fails when worker emits proposals and librarian is missing', async () => {
        const workerWithProposal: IWorker = {
            ...createMockWorker(),
            execute: vi.fn().mockResolvedValue(makeWorkerResult({
                memoryProposals: [{
                    proposalId: 'proposal-1',
                    tenantId: 'tenant-1',
                    sourceAgentId: 'agent-worker',
                    kind: 'observation',
                    title: 'Observed issue',
                    rawContent: 'Dispatcher retries twice before escalate.',
                    summary: 'retry policy observation',
                    tags: ['runtime'],
                    confidence: 0.8,
                    createdAt: new Date().toISOString(),
                }],
            })),
        }
        const workerRegistry: WorkerRegistry = new Map([[AgentRole.Worker, workerWithProposal]])
        const executor = new WorkerTaskExecutor(mockGovernor, mockEvalPipeline, workerRegistry, agentId)
        const dag = makeDAG([makeNode()])

        const result = await executor.executeNode(dag, 0)

        expect(result.success).toBe(false)
        expect(result.errorMessage).toContain('no Librarian is configured')
    })
})
