import { describe, expect, it } from 'vitest'
import { AgentRole, MemoryMode, ModelTier, TaskPriority, createAgentId, createTaskId } from '@shared/types'
import type { DispatcherState, PlanEnvelope, WorkflowCheckpoint } from '@shared/types'
import type { ICheckpointStore } from './ICheckpointStore'
import { WorkflowResumer } from './WorkflowResumer'
import { DAGNodeStatus } from '@orchestrator/TaskDAG'

class InMemoryCheckpointStore implements ICheckpointStore {
  private readonly byPlan = new Map<string, WorkflowCheckpoint>()

  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    this.byPlan.set(checkpoint.planId, checkpoint)
  }

  async load(planId: string): Promise<WorkflowCheckpoint | null> {
    return this.byPlan.get(planId) ?? null
  }

  async list(tenantId: string): Promise<WorkflowCheckpoint[]> {
    return Array.from(this.byPlan.values()).filter((cp) => cp.tenantId === tenantId)
  }

  async delete(checkpointId: string): Promise<void> {
    for (const [planId, checkpoint] of this.byPlan.entries()) {
      if (checkpoint.checkpointId === checkpointId) {
        this.byPlan.delete(planId)
      }
    }
  }
}

function makeEnvelope(): PlanEnvelope {
  const a = createTaskId('node-a')
  const b = createTaskId('node-b')
  return {
    planId: 'plan-1',
    goalId: 'goal-1',
    tenantId: 'tenant-1',
    createdAt: '2026-03-08T00:00:00.000Z',
    createdBy: {
      agentId: createAgentId('jarvis'),
      roleName: AgentRole.Orchestrator,
      createdAt: '2026-03-08T00:00:00.000Z',
      budgetAllocated: { maxTokens: 1000, maxToolCalls: 100, maxWallTimeSec: 100 },
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
    budgetEnvelope: { maxTokens: 1000, maxToolCalls: 100, maxWallTimeSec: 100 },
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
  }
}

function makeState(overrides: Partial<DispatcherState> = {}): DispatcherState {
  return {
    planId: 'plan-1',
    tenantId: 'tenant-1',
    activeNodeIds: [],
    completedNodeIds: [],
    failedNodeIds: [],
    retryCounts: {},
    waitingNodeIds: [],
    executionStatus: 'running',
    ...overrides,
  }
}

function makeCheckpoint(state: DispatcherState, overrides: Partial<WorkflowCheckpoint> = {}): WorkflowCheckpoint {
  return {
    checkpointId: 'cp-1',
    planId: 'plan-1',
    tenantId: 'tenant-1',
    status: state.executionStatus,
    dispatcherState: state,
    serializedNodeStates: {},
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('WorkflowResumer', () => {
  it('resumes from a valid checkpoint', async () => {
    const store = new InMemoryCheckpointStore()
    await store.save(makeCheckpoint(makeState()))
    const resumer = new WorkflowResumer(store)

    const result = await resumer.resume('plan-1', makeEnvelope())

    expect(result.resumed).toBe(true)
    expect(result.dispatcherState?.planId).toBe('plan-1')
  })

  it('skips completed nodes when computing ready nodes', async () => {
    const store = new InMemoryCheckpointStore()
    await store.save(makeCheckpoint(makeState({ completedNodeIds: ['node-a'] })))
    const resumer = new WorkflowResumer(store)

    const result = await resumer.resume('plan-1', makeEnvelope())

    expect(result.readyNodeIds).toEqual(['node-b'])
  })

  it('re-queues failed nodes for retry', async () => {
    const store = new InMemoryCheckpointStore()
    await store.save(makeCheckpoint(makeState({ failedNodeIds: ['node-a'] })))
    const resumer = new WorkflowResumer(store)

    const result = await resumer.resume('plan-1', makeEnvelope())

    expect(result.dispatcherState?.failedNodeIds).toEqual([])
    expect(result.dispatcherState?.retryCounts['node-a']).toBeGreaterThanOrEqual(1)
  })

  it('returns not resumed when checkpoint is missing', async () => {
    const resumer = new WorkflowResumer(new InMemoryCheckpointStore())

    const result = await resumer.resume('missing-plan', makeEnvelope())

    expect(result).toEqual({ resumed: false, readyNodeIds: [] })
  })

  it('returns durability fault for corrupt checkpoint state', async () => {
    const store = new InMemoryCheckpointStore()
    await store.save(makeCheckpoint({ ...makeState(), completedNodeIds: 'not-array' as unknown as string[] }))
    const resumer = new WorkflowResumer(store)

    const result = await resumer.resume('plan-1', makeEnvelope())

    expect(result.resumed).toBe(false)
    expect(result.escalationReason).toBe('durability_fault')
  })

  it('preserves hibernated status on resume', async () => {
    const store = new InMemoryCheckpointStore()
    await store.save(makeCheckpoint(makeState({ executionStatus: 'hibernated' })))
    const resumer = new WorkflowResumer(store)

    const result = await resumer.resume('plan-1', makeEnvelope())

    expect(result.dispatcherState?.executionStatus).toBe('hibernated')
  })

  it('keeps wait conditions represented as waiting nodes', async () => {
    const store = new InMemoryCheckpointStore()
    await store.save(makeCheckpoint(makeState({ waitingNodeIds: ['node-a'], executionStatus: 'waiting' })))
    const resumer = new WorkflowResumer(store)

    const result = await resumer.resume('plan-1', makeEnvelope())

    expect(result.dispatcherState?.waitingNodeIds).toContain('node-a')
    expect(result.readyNodeIds).toEqual([])
  })

  it('enforces tenant isolation during resume', async () => {
    const store = new InMemoryCheckpointStore()
    await store.save(makeCheckpoint(makeState(), { tenantId: 'tenant-2' }))
    const resumer = new WorkflowResumer(store)

    const result = await resumer.resume('plan-1', makeEnvelope())

    expect(result.resumed).toBe(false)
    expect(result.escalationReason).toBe('durability_fault')
  })
})
