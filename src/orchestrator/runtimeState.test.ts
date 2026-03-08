import { describe, expect, it } from 'vitest'
import {
  AgentRole,
  MemoryMode,
  ModelTier,
  TaskPriority,
  createAgentId,
  createTaskId,
} from '@shared/types'
import type { PlanEnvelope } from '@shared/types'
import { DAGNodeStatus } from './TaskDAG'
import {
  canRetryNode,
  createDispatcherState,
  getReadyNodeIds,
  incrementRetryCount,
  isDependencyDeadlocked,
  isPlanCompleted,
  markEscalated,
  markNodeCompleted,
  markNodeFailed,
  markNodeRetryPending,
} from './runtimeState'

function makeEnvelope(): PlanEnvelope {
  const root = createTaskId('task-root')
  const child = createTaskId('task-child')

  return {
    planId: 'plan-1',
    goalId: 'goal-1',
    tenantId: 'tenant-1',
    createdAt: new Date('2026-03-08T00:00:00.000Z').toISOString(),
    createdBy: {
      agentId: createAgentId('agent-jarvis'),
      roleName: AgentRole.Orchestrator,
      createdAt: new Date('2026-03-08T00:00:00.000Z').toISOString(),
      budgetAllocated: { maxTokens: 1000, maxToolCalls: 10, maxWallTimeSec: 30 },
      toolBundleResolved: {
        tools: [],
        sandbox: { network: 'restricted', filesystem: 'ephemeral' },
      },
      memoryPolicyResolved: {
        mode: MemoryMode.Ephemeral,
        allowedArtifactReads: [],
        allowedArtifactWrites: [],
      },
      lineage: {
        rootAgentId: createAgentId('agent-root'),
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
      goalDescription: 'Goal',
      createdAt: new Date('2026-03-08T00:00:00.000Z').toISOString(),
      nodes: [
        {
          taskId: root,
          name: 'root',
          description: 'root',
          assignedRole: AgentRole.Worker,
          dependencies: [],
          priority: TaskPriority.Normal,
          status: DAGNodeStatus.Pending,
        },
        {
          taskId: child,
          name: 'child',
          description: 'child',
          assignedRole: AgentRole.Worker,
          dependencies: [root],
          priority: TaskPriority.Normal,
          status: DAGNodeStatus.Pending,
        },
      ],
    },
    budgetEnvelope: {
      maxTokens: 1000,
      maxToolCalls: 10,
      maxWallTimeSec: 60,
    },
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
      maxTokens: 3000,
      allowedKinds: ['observation'],
    },
  }
}

describe('runtimeState', () => {
  it('creates initial dispatcher state', () => {
    const envelope = makeEnvelope()
    const state = createDispatcherState(envelope)

    expect(state.planId).toBe(envelope.planId)
    expect(state.executionStatus).toBe('planned')
    expect(state.completedNodeIds).toEqual([])
  })

  it('returns only dependency-ready nodes', () => {
    const envelope = makeEnvelope()
    const state = createDispatcherState(envelope)
    const ready = getReadyNodeIds(envelope, state)

    expect(ready).toEqual(['task-root'])
  })

  it('unblocks dependents after completion', () => {
    const envelope = makeEnvelope()
    const initial = createDispatcherState(envelope)
    const completed = markNodeCompleted(initial, 'task-root')
    const ready = getReadyNodeIds(envelope, completed)

    expect(ready).toEqual(['task-child'])
  })

  it('tracks retries against policy', () => {
    const envelope = makeEnvelope()
    const initial = createDispatcherState(envelope)
    const once = incrementRetryCount(initial, 'task-root')
    const twice = incrementRetryCount(once, 'task-root')

    expect(canRetryNode(once, 'task-root', envelope.escalationPolicy)).toBe(true)
    expect(canRetryNode(twice, 'task-root', envelope.escalationPolicy)).toBe(false)
  })

  it('returns failed nodes to retry-pending state', () => {
    const envelope = makeEnvelope()
    const initial = createDispatcherState(envelope)
    const failed = markNodeFailed(initial, 'task-root')
    const retrying = markNodeRetryPending(failed, 'task-root')

    expect(failed.failedNodeIds).toContain('task-root')
    expect(retrying.failedNodeIds).not.toContain('task-root')
    expect(retrying.executionStatus).toBe('retrying')
  })

  it('marks escalation with reason', () => {
    const envelope = makeEnvelope()
    const initial = createDispatcherState(envelope)
    const escalated = markEscalated(initial, 'node_retry_limit')

    expect(escalated.executionStatus).toBe('escalated')
    expect(escalated.lastEscalationReason).toBe('node_retry_limit')
  })

  it('detects completed plans', () => {
    const envelope = makeEnvelope()
    const state = {
      ...createDispatcherState(envelope),
      completedNodeIds: ['task-root', 'task-child'],
    }

    expect(isPlanCompleted(envelope, state)).toBe(true)
  })

  it('flags deadlocked dependency graphs with no runnable nodes', () => {
    const envelope = makeEnvelope()
    const state = {
      ...createDispatcherState(envelope),
      failedNodeIds: ['task-root'],
    }

    expect(isDependencyDeadlocked(envelope, state)).toBe(true)
  })
})
