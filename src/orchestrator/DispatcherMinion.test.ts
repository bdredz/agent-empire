import { describe, expect, it, vi } from 'vitest'
import type { TaskExecutor } from './IJarvis'
import { DispatcherMinion } from './DispatcherMinion'
import type { IBudgetGovernor } from '@governor/IBudgetGovernor'
import type { EvalPipeline } from '@eval/EvalPipeline'
import {
  AgentRole,
  MemoryMode,
  ModelTier,
  TaskPriority,
  createAgentId,
  createTaskId,
} from '@shared/types'
import type { PlanEnvelope, WorkflowCheckpoint } from '@shared/types'
import { DAGNodeStatus } from './TaskDAG'

function makeEnvelope(overrides: Partial<PlanEnvelope> = {}): PlanEnvelope {
  const a = createTaskId('node-a')
  const b = createTaskId('node-b')
  return {
    planId: 'plan-1',
    goalId: 'goal-1',
    tenantId: 'tenant-1',
    createdAt: '2026-03-08T00:00:00.000Z',
    createdBy: {
      agentId: createAgentId('jarvis-1'),
      roleName: AgentRole.Orchestrator,
      createdAt: '2026-03-08T00:00:00.000Z',
      budgetAllocated: { maxTokens: 1000, maxToolCalls: 100, maxWallTimeSec: 120 },
      toolBundleResolved: { tools: [], sandbox: { network: 'restricted', filesystem: 'ephemeral' } },
      memoryPolicyResolved: { mode: MemoryMode.Ephemeral, allowedArtifactReads: [], allowedArtifactWrites: [] },
      lineage: {
        rootAgentId: createAgentId('root'),
        parentAgentId: null,
        depth: 0,
        spawnReason: 'test',
        lineageContextRefs: [],
      },
      provenanceHash: 'hash',
      status: 'ready',
      modelTier: ModelTier.Standard,
    },
    taskDag: {
      goalId: 'goal-1',
      goalDescription: 'goal',
      createdAt: '2026-03-08T00:00:00.000Z',
      nodes: [
        {
          taskId: a,
          name: 'A',
          description: 'A',
          assignedRole: AgentRole.Worker,
          dependencies: [],
          priority: TaskPriority.Normal,
          status: DAGNodeStatus.Pending,
        },
        {
          taskId: b,
          name: 'B',
          description: 'B',
          assignedRole: AgentRole.Worker,
          dependencies: [a],
          priority: TaskPriority.Normal,
          status: DAGNodeStatus.Pending,
        },
      ],
    },
    budgetEnvelope: { maxTokens: 1000, maxToolCalls: 100, maxWallTimeSec: 120 },
    escalationPolicy: {
      maxRetriesPerNode: 2,
      escalateOnBudgetTrip: true,
      escalateOnEvalFailure: true,
      escalateOnMechanicUnsafeAction: true,
    },
    retrievalPolicy: {
      tenantId: 'tenant-1',
      includeGlobalArchitecture: false,
      maxFacts: 20,
      maxTokens: 2000,
      allowedKinds: ['observation'],
    },
    ...overrides,
  }
}

function makeGovernor(overrides?: Partial<IBudgetGovernor>): IBudgetGovernor {
  return {
    allocate: vi.fn(),
    recordUsage: vi.fn(),
    checkBudget: vi.fn().mockReturnValue({ withinLimits: true, warnings: [], exceeded: [] }),
    tripCircuitBreaker: vi.fn(),
    getUsage: vi.fn().mockReturnValue({ tokensUsed: 0, toolCallsUsed: 0, wallTimeElapsedSec: 0, costUnitsUsed: 0 }),
    ...overrides,
  }
}

function makeEvalPipeline(): EvalPipeline {
  return { evaluate: vi.fn() } as unknown as EvalPipeline
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('DispatcherMinion', () => {
  it('accepts a plan and completes all nodes', async () => {
    const executor: TaskExecutor = { executeNode: vi.fn().mockResolvedValue({ success: true }) }
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())
    const envelope = makeEnvelope()

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'completed')

    const state = dispatcher.getState(envelope.planId)
    expect(state.completedNodeIds).toHaveLength(2)
  })

  it('schedules dependent nodes in order', async () => {
    const order: string[] = []
    const executor: TaskExecutor = {
      executeNode: vi.fn().mockImplementation(async (dag, nodeIndex) => {
        order.push(dag.nodes[nodeIndex]!.name)
        return { success: true }
      }),
    }
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())
    const envelope = makeEnvelope()

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'completed')

    expect(order).toEqual(['A', 'B'])
  })

  it('retries failed nodes before succeeding', async () => {
    let attempts = 0
    const executor: TaskExecutor = {
      executeNode: vi.fn().mockImplementation(async () => {
        attempts += 1
        return attempts === 1 ? { success: false, errorMessage: 'transient' } : { success: true }
      }),
    }
    const envelope = makeEnvelope({ taskDag: { ...makeEnvelope().taskDag, nodes: [makeEnvelope().taskDag.nodes[0]!] } })
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'completed')

    expect(dispatcher.getState(envelope.planId).retryCounts['node-a']).toBe(1)
  })

  it('escalates when retry limit is reached', async () => {
    const executor: TaskExecutor = { executeNode: vi.fn().mockResolvedValue({ success: false, errorMessage: 'hard fail' }) }
    const envelope = makeEnvelope({
      taskDag: { ...makeEnvelope().taskDag, nodes: [makeEnvelope().taskDag.nodes[0]!] },
      escalationPolicy: { ...makeEnvelope().escalationPolicy, maxRetriesPerNode: 1 },
    })
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'escalated')

    expect(dispatcher.getState(envelope.planId).lastEscalationReason).toBe('node_retry_limit')
  })

  it('escalates on budget trip', async () => {
    const governor = makeGovernor({ checkBudget: vi.fn().mockReturnValue({ withinLimits: false, warnings: [], exceeded: ['trip'] }) })
    const executor: TaskExecutor = { executeNode: vi.fn().mockResolvedValue({ success: true }) }
    const dispatcher = new DispatcherMinion(executor, governor, makeEvalPipeline())
    const envelope = makeEnvelope()

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'escalated')

    expect(dispatcher.getState(envelope.planId).lastEscalationReason).toBe('budget_trip')
  })

  it('supports pause and resume', async () => {
    const envelope = makeEnvelope()
    let dispatcherRef: DispatcherMinion
    const executor: TaskExecutor = {
      executeNode: vi.fn().mockImplementation(async (_dag, index) => {
        if (index === 0) {
          dispatcherRef.pause(envelope.planId)
        }
        return { success: true }
      }),
    }
    dispatcherRef = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())

    await dispatcherRef.accept(envelope)
    await waitFor(() => dispatcherRef.getState(envelope.planId).executionStatus === 'waiting')
    expect(dispatcherRef.getState(envelope.planId).completedNodeIds).toContain('node-a')

    dispatcherRef.resume(envelope.planId)
    await waitFor(() => dispatcherRef.getState(envelope.planId).executionStatus === 'completed')
    expect(dispatcherRef.getState(envelope.planId).completedNodeIds).toContain('node-b')
  })

  it('executes concurrent ready nodes in the same batch', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const envelope = makeEnvelope({
      taskDag: {
        ...makeEnvelope().taskDag,
        nodes: [
          { ...makeEnvelope().taskDag.nodes[0]!, taskId: createTaskId('n1'), dependencies: [] },
          { ...makeEnvelope().taskDag.nodes[0]!, taskId: createTaskId('n2'), name: 'N2', dependencies: [] },
        ],
      },
    })
    const executor: TaskExecutor = {
      executeNode: vi.fn().mockImplementation(async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 20))
        inFlight -= 1
        return { success: true }
      }),
    }
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline(), { maxConcurrentNodes: 2 })

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'completed')

    expect(maxInFlight).toBeGreaterThanOrEqual(2)
  })

  it('moves node to waiting state on wait signal', async () => {
    const envelope = makeEnvelope({ taskDag: { ...makeEnvelope().taskDag, nodes: [makeEnvelope().taskDag.nodes[0]!] } })
    const executor: TaskExecutor = { executeNode: vi.fn().mockResolvedValue({ success: false, errorMessage: 'wait:rate_limit' }) }
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'waiting')

    expect(dispatcher.getState(envelope.planId).waitingNodeIds).toContain('node-a')
  })

  it('hibernates on infra outage signal', async () => {
    const envelope = makeEnvelope({ taskDag: { ...makeEnvelope().taskDag, nodes: [makeEnvelope().taskDag.nodes[0]!] } })
    const executor: TaskExecutor = {
      executeNode: vi.fn().mockResolvedValue({ success: false, errorMessage: 'infra_outage hibernate now' }),
    }
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'hibernated')

    expect(dispatcher.getState(envelope.planId).waitingNodeIds).toContain('node-a')
  })

  it('serializes checkpoints on transitions', async () => {
    const saves: WorkflowCheckpoint[] = []
    const checkpointStore = { save: vi.fn().mockImplementation(async (cp: WorkflowCheckpoint) => saves.push(cp)) }
    const executor: TaskExecutor = { executeNode: vi.fn().mockResolvedValue({ success: true }) }
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline(), { checkpointStore })
    const envelope = makeEnvelope()

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'completed')

    expect(saves.length).toBeGreaterThan(0)
    expect(() => JSON.stringify(saves[saves.length - 1])).not.toThrow()
    expect(saves[saves.length - 1]?.serializedNodeStates).toBeDefined()
  })

  it('escalates unsafe action failures with typed reason', async () => {
    const envelope = makeEnvelope({ taskDag: { ...makeEnvelope().taskDag, nodes: [makeEnvelope().taskDag.nodes[0]!] } })
    const executor: TaskExecutor = {
      executeNode: vi.fn().mockResolvedValue({ success: false, errorMessage: 'unsafe action detected' }),
    }
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'escalated')

    expect(dispatcher.getState(envelope.planId).lastEscalationReason).toBe('unsafe_action')
  })

  it('escalates eval failures when policy requires it', async () => {
    const envelope = makeEnvelope({ taskDag: { ...makeEnvelope().taskDag, nodes: [makeEnvelope().taskDag.nodes[0]!] } })
    const executor: TaskExecutor = {
      executeNode: vi.fn().mockResolvedValue({
        success: false,
        errorMessage: 'Eval failed at deterministic stage',
        evalResult: { outcome: 'fail', reasoning: 'bad', evaluatorId: 'x', timestamp: new Date().toISOString() },
      }),
    }
    const dispatcher = new DispatcherMinion(executor, makeGovernor(), makeEvalPipeline())

    await dispatcher.accept(envelope)
    await waitFor(() => dispatcher.getState(envelope.planId).executionStatus === 'escalated')

    expect(dispatcher.getState(envelope.planId).lastEscalationReason).toBe('eval_failure')
  })
})
