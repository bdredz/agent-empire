/**
 * Integration test: Jarvis → Dispatcher → Worker → Eval flow (P2-O6)
 *
 * Tests the end-to-end control plane using:
 * - Mocked GoalAnalyzer (returns deterministic 2-node DAG)
 * - Mocked TaskExecutor (simulates worker execution with configurable success/failure)
 * - Real DispatcherMinion (wired with mocked IBudgetGovernor)
 * - Real AuditMinion (deterministic, no LLM)
 * - Mocked EvalPipeline (or real with mocked evaluators)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Jarvis } from '@orchestrator/Jarvis'
import { DispatcherMinion } from '@orchestrator/DispatcherMinion'
import { AuditMinion } from '../minions/AuditMinion'
import { EvalPipeline } from '@eval/EvalPipeline'
import { DeterministicEvaluator } from '@eval/DeterministicEvaluator'
import { LlmCriticEvaluator } from '@eval/LlmCriticEvaluator'
import { EscalationEvaluator } from '@eval/EscalationEvaluator'
import type { GoalAnalyzer, GoalAnalysis, TaskExecutor } from '@orchestrator/IJarvis'
import type { IBudgetGovernor } from '@governor/IBudgetGovernor'
import type { EscalationReason } from '@shared/types'
import {
  AgentRole,
  AgentStatus,
  EvalOutcome,
  MemoryMode,
  ModelTier,
  SandboxNetwork,
  TaskPriority,
  createAgentId,
  createTaskId,
} from '@shared/types'
import type { TaskDAG } from '@orchestrator/TaskDAG'
import { DAGNodeStatus } from '@orchestrator/TaskDAG'
import { nanoid } from 'nanoid'

// ---------------------------------------------------------------------------
// Helpers — build a minimal 2-node DAG for all tests
// node-A has no deps; node-B depends on node-A
// ---------------------------------------------------------------------------

function buildTwoNodeDAG(): TaskDAG {
  const nodeAId = createTaskId('node-a')
  const nodeBId = createTaskId('node-b')
  return {
    goalId: `goal-${nanoid()}`,
    goalDescription: 'Integration test goal',
    createdAt: new Date().toISOString(),
    nodes: [
      {
        taskId: nodeAId,
        name: 'Node A',
        description: 'First task',
        assignedRole: AgentRole.Worker,
        dependencies: [],
        priority: TaskPriority.Normal,
        status: DAGNodeStatus.Pending,
      },
      {
        taskId: nodeBId,
        name: 'Node B',
        description: 'Second task, depends on A',
        assignedRole: AgentRole.Worker,
        dependencies: [nodeAId],
        priority: TaskPriority.Normal,
        status: DAGNodeStatus.Pending,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Factory — build a real EvalPipeline backed by mocked evaluators
// ---------------------------------------------------------------------------

function buildPassingEvalPipeline(auditMinion: AuditMinion): EvalPipeline {
  const deterministicEvaluator = new DeterministicEvaluator()
  // DeterministicEvaluator with zero checks always passes
  vi.spyOn(deterministicEvaluator, 'evaluate').mockResolvedValue({
    outcome: EvalOutcome.Pass,
    scores: { completeness: 1.0 },
    reasoning: 'All checks passed',
    evaluatorId: 'deterministic',
    timestamp: new Date().toISOString(),
  })

  const llmCriticEvaluator = new LlmCriticEvaluator({
    evaluate: vi.fn().mockResolvedValue({ pass: true, confidence: 0.95, reasoning: 'Looks good' }),
  })

  const escalationEvaluator = new EscalationEvaluator({
    evaluate: vi.fn().mockResolvedValue({
      pass: true,
      confidence: 0.9,
      reasoning: 'Escalation pass',
      recommendation: 'accept' as const,
    }),
  })

  return new EvalPipeline(deterministicEvaluator, llmCriticEvaluator, escalationEvaluator, {}, auditMinion)
}

// ---------------------------------------------------------------------------
// Factory — mock IBudgetGovernor (within limits by default)
// ---------------------------------------------------------------------------

function buildMockGovernor(withinLimits = true): IBudgetGovernor {
  return {
    allocate: vi.fn(),
    recordUsage: vi.fn(),
    checkBudget: vi.fn().mockReturnValue({ withinLimits, warnings: [], exceeded: [] }),
    tripCircuitBreaker: vi.fn(),
    getUsage: vi.fn().mockReturnValue({
      tokensUsed: 0,
      toolCallsUsed: 0,
      wallTimeElapsedSec: 0,
      costUnitsUsed: 0,
    }),
  }
}

// ---------------------------------------------------------------------------
// Factory — build GoalAnalyzer mock returning a fixed DAG
// ---------------------------------------------------------------------------

function buildMockGoalAnalyzer(dag: TaskDAG): GoalAnalyzer {
  const analysis: GoalAnalysis = {
    fields: {
      objective: 'Test goal',
      scope: 'Integration test',
      constraints: 'none',
      audience: 'engineers',
      success_criteria: 'all nodes complete',
      dependencies: 'none',
      risk_tolerance: 'low',
      approval_required: 'no',
      timeline: '1 day',
      priority: 'normal',
    },
    suggestedTasks: ['Node A', 'Node B'],
    estimatedComplexity: 'low',
  }
  return {
    analyzeGoal: vi.fn().mockResolvedValue(analysis),
    decomposeGoal: vi.fn().mockResolvedValue(dag),
  }
}

// ---------------------------------------------------------------------------
// Utility — poll dispatcher state until terminal or timeout
// ---------------------------------------------------------------------------

async function waitForTerminalState(
  dispatcher: DispatcherMinion,
  planId: string,
  timeoutMs = 3000,
): Promise<string> {
  const terminalStatuses = new Set(['completed', 'failed', 'escalated'])
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const state = dispatcher.getState(planId)
    if (terminalStatuses.has(state.executionStatus)) {
      return state.executionStatus
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return dispatcher.getState(planId).executionStatus
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Control Plane Integration: Jarvis → Dispatcher → Worker → Eval', () => {
  let dag: TaskDAG
  let auditMinion: AuditMinion

  beforeEach(() => {
    dag = buildTwoNodeDAG()
    auditMinion = new AuditMinion()
  })

  // -------------------------------------------------------------------------
  // Test 1: Happy path — all nodes succeed, plan completes
  // -------------------------------------------------------------------------

  it('happy path: Jarvis creates plan, dispatcher accepts, all workers succeed, state = completed', async () => {
    const taskExecutor: TaskExecutor = {
      executeNode: vi.fn().mockResolvedValue({ success: true }),
    }

    const evalPipeline = buildPassingEvalPipeline(auditMinion)
    const governor = buildMockGovernor(true)
    const escalationSink = vi.fn()

    const dispatcher = new DispatcherMinion(taskExecutor, governor, evalPipeline, {
      escalationSink,
    })

    const goalAnalyzer = buildMockGoalAnalyzer(dag)
    const jarvis = new Jarvis(goalAnalyzer, taskExecutor, {}, dispatcher)

    const envelope = await jarvis.createPlan('Build a simple feature', 'tenant-1')
    await dispatcher.accept(envelope)

    const finalStatus = await waitForTerminalState(dispatcher, envelope.planId)

    expect(finalStatus).toBe('completed')

    const state = dispatcher.getState(envelope.planId)
    expect(state.completedNodeIds).toHaveLength(2)
    expect(state.failedNodeIds).toHaveLength(0)
    expect(escalationSink).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Test 2: Worker fails once, retries and succeeds on second attempt
  // -------------------------------------------------------------------------

  it('worker failure → dispatcher retry: worker fails first, succeeds on retry', async () => {
    let callCount = 0
    const taskExecutor: TaskExecutor = {
      executeNode: vi.fn().mockImplementation(() => {
        callCount++
        // First call fails, subsequent calls succeed
        if (callCount === 1) {
          return Promise.resolve({ success: false, errorMessage: 'transient error' })
        }
        return Promise.resolve({ success: true })
      }),
    }

    const evalPipeline = buildPassingEvalPipeline(auditMinion)
    const governor = buildMockGovernor(true)
    const escalationSink = vi.fn()

    const dispatcher = new DispatcherMinion(taskExecutor, governor, evalPipeline, {
      escalationSink,
      // maxConcurrentNodes default (4) is fine
    })

    // Use a policy that allows retries
    const goalAnalyzer = buildMockGoalAnalyzer(dag)
    const jarvis = new Jarvis(goalAnalyzer, taskExecutor, {}, dispatcher)
    const envelope = await jarvis.createPlan('Feature with retry', 'tenant-2')

    // Override escalation policy to allow retries
    const envelopeWithRetries = {
      ...envelope,
      escalationPolicy: {
        maxRetriesPerNode: 3,
        escalateOnBudgetTrip: false,
        escalateOnEvalFailure: false,
        escalateOnMechanicUnsafeAction: false,
      },
    }

    await dispatcher.accept(envelopeWithRetries)

    const finalStatus = await waitForTerminalState(dispatcher, envelope.planId)

    // After retry, plan should complete (node-A retried and succeeded, node-B then executes)
    expect(finalStatus).toBe('completed')
    const state = dispatcher.getState(envelope.planId)
    expect(state.completedNodeIds).toHaveLength(2)
    expect(escalationSink).not.toHaveBeenCalled()
    // executeNode was called more than 2 times due to retry
    expect(taskExecutor.executeNode).toHaveBeenCalledTimes(3) // fail + retry(A) + B
  })

  // -------------------------------------------------------------------------
  // Test 3: Retry limit exceeded → escalation triggered
  // -------------------------------------------------------------------------

  it('retry limit exceeded → dispatcher escalates with node_retry_limit', async () => {
    const taskExecutor: TaskExecutor = {
      executeNode: vi.fn().mockResolvedValue({
        success: false,
        errorMessage: 'persistent failure',
      }),
    }

    const evalPipeline = buildPassingEvalPipeline(auditMinion)
    const governor = buildMockGovernor(true)

    const capturedEscalations: Array<{ planId: string; reason: EscalationReason }> = []
    const escalationSink = vi.fn().mockImplementation((planId: string, reason: EscalationReason) => {
      capturedEscalations.push({ planId, reason })
      return Promise.resolve()
    })

    const dispatcher = new DispatcherMinion(taskExecutor, governor, evalPipeline, {
      escalationSink,
    })

    const goalAnalyzer = buildMockGoalAnalyzer(dag)
    const jarvis = new Jarvis(goalAnalyzer, taskExecutor, {}, dispatcher)
    const envelope = await jarvis.createPlan('Goal that always fails', 'tenant-3')

    // Set maxRetriesPerNode to 0 so first failure immediately triggers escalation
    const envelopeZeroRetries = {
      ...envelope,
      escalationPolicy: {
        maxRetriesPerNode: 0,
        escalateOnBudgetTrip: true,
        escalateOnEvalFailure: true,
        escalateOnMechanicUnsafeAction: true,
      },
    }

    await dispatcher.accept(envelopeZeroRetries)

    const finalStatus = await waitForTerminalState(dispatcher, envelope.planId)

    expect(finalStatus).toBe('escalated')

    const state = dispatcher.getState(envelope.planId)
    expect(state.lastEscalationReason).toBe('node_retry_limit')

    expect(capturedEscalations).toHaveLength(1)
    expect(capturedEscalations[0]?.reason).toBe('node_retry_limit')
  })

  // -------------------------------------------------------------------------
  // Test 4: Budget exhausted during execution → budget_trip escalation
  // -------------------------------------------------------------------------

  it('budget trip: budget exhausted during execution → escalates with budget_trip', async () => {
    // Worker succeeds but budget is already exhausted (returns withinLimits: false)
    const taskExecutor: TaskExecutor = {
      executeNode: vi.fn().mockResolvedValue({ success: true }),
    }

    const evalPipeline = buildPassingEvalPipeline(auditMinion)

    // Governor always reports budget exceeded
    const governor = buildMockGovernor(false)

    const capturedEscalations: Array<{ planId: string; reason: EscalationReason }> = []
    const escalationSink = vi.fn().mockImplementation((planId: string, reason: EscalationReason) => {
      capturedEscalations.push({ planId, reason })
      return Promise.resolve()
    })

    const dispatcher = new DispatcherMinion(taskExecutor, governor, evalPipeline, {
      escalationSink,
    })

    const goalAnalyzer = buildMockGoalAnalyzer(dag)
    const jarvis = new Jarvis(goalAnalyzer, taskExecutor, {}, dispatcher)
    const envelope = await jarvis.createPlan('Goal with tight budget', 'tenant-4')

    // Ensure budget trip escalation is enabled
    const envelopeWithBudgetPolicy = {
      ...envelope,
      escalationPolicy: {
        maxRetriesPerNode: 3,
        escalateOnBudgetTrip: true,
        escalateOnEvalFailure: false,
        escalateOnMechanicUnsafeAction: false,
      },
    }

    await dispatcher.accept(envelopeWithBudgetPolicy)

    const finalStatus = await waitForTerminalState(dispatcher, envelope.planId)

    expect(finalStatus).toBe('escalated')

    const state = dispatcher.getState(envelope.planId)
    expect(state.lastEscalationReason).toBe('budget_trip')

    expect(capturedEscalations.length).toBeGreaterThanOrEqual(1)
    expect(capturedEscalations[0]?.reason).toBe('budget_trip')
  })
})
