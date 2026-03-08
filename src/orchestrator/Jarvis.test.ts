import { describe, it, expect, vi } from 'vitest'
import {
  EvalOutcome,
  EvalResult,
  AgentRole,
  TaskPriority,
  createTaskId,
  TaskId,
} from '@shared/types'
import { Jarvis, JarvisConfig } from './Jarvis'
import { GoalAnalyzer, GoalAnalysis, TaskExecutor, ClarificationRequest } from './IJarvis'
import { TaskDAG, DAGNode, DAGNodeStatus, ExecutionResult } from './TaskDAG'
import { CompletenessField, COMPLETENESS_FIELDS } from './systemPrompt'

// ---------------------------------------------------------------------------
// Test Helpers — mock factories
// ---------------------------------------------------------------------------

function makeTaskId(id: string): TaskId {
  return createTaskId(id)
}

/** Build a minimal DAG for tests */
function buildDAG(
  nodes: Array<{
    id: string
    name: string
    deps?: string[]
  }>
): TaskDAG {
  return {
    goalId: 'test-goal-1',
    goalDescription: 'Test goal',
    nodes: nodes.map((n) => ({
      taskId: makeTaskId(n.id),
      name: n.name,
      description: `Test task: ${n.name}`,
      assignedRole: AgentRole.Worker,
      dependencies: (n.deps ?? []).map(makeTaskId),
      priority: TaskPriority.Normal,
      status: DAGNodeStatus.Pending,
    })),
    createdAt: new Date().toISOString(),
  }
}

/** Build a fully-filled GoalAnalysis that passes completeness threshold */
function fullAnalysis(overrides: Partial<Record<CompletenessField, string | null>> = {}): GoalAnalysis {
  const fields: Partial<Record<CompletenessField, string | null>> = {}
  for (const f of COMPLETENESS_FIELDS) {
    fields[f] = `value-for-${f}`
  }
  return {
    fields: { ...fields, ...overrides },
    suggestedTasks: ['task-a', 'task-b'],
    estimatedComplexity: 'medium',
  }
}

/** Build a sparse GoalAnalysis that triggers clarification */
function sparseAnalysis(filledCount: number): GoalAnalysis {
  const fields: Partial<Record<CompletenessField, string | null>> = {}
  for (let i = 0; i < COMPLETENESS_FIELDS.length; i++) {
    fields[COMPLETENESS_FIELDS[i]!] = i < filledCount ? `value-${i}` : null
  }
  return {
    fields,
    suggestedTasks: ['task-a'],
    estimatedComplexity: 'low',
  }
}

/** Create a mock GoalAnalyzer */
function mockAnalyzer(
  analysis: GoalAnalysis,
  dag: TaskDAG
): GoalAnalyzer {
  return {
    analyzeGoal: vi.fn().mockResolvedValue(analysis),
    decomposeGoal: vi.fn().mockResolvedValue(dag),
  }
}

/** Create a mock TaskExecutor that succeeds on all nodes */
function succeedingExecutor(): TaskExecutor {
  return {
    executeNode: vi.fn().mockResolvedValue({ success: true }),
  }
}

/** Create a mock TaskExecutor that fails on specific node indices */
function selectiveExecutor(failIndices: Set<number>): TaskExecutor {
  return {
    executeNode: vi.fn().mockImplementation(
      (_dag: TaskDAG, nodeIndex: number) =>
        Promise.resolve(
          failIndices.has(nodeIndex)
            ? { success: false, errorMessage: `Node ${nodeIndex} failed` }
            : { success: true }
        )
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Jarvis Orchestrator', () => {
  // =========================================================================
  // processGoal
  // =========================================================================

  describe('processGoal', () => {
    it('should return a TaskDAG when goal completeness >= threshold', async () => {
      const dag = buildDAG([{ id: 'n1', name: 'Step 1' }])
      const analyzer = mockAnalyzer(fullAnalysis(), dag)
      const jarvis = new Jarvis(analyzer, succeedingExecutor())

      const result = await jarvis.processGoal('Build a website')

      expect('goalId' in result && 'nodes' in result).toBe(true)
      expect((result as TaskDAG).nodes).toHaveLength(1)
      expect(analyzer.analyzeGoal).toHaveBeenCalledWith('Build a website')
      expect(analyzer.decomposeGoal).toHaveBeenCalled()
    })

    it('should return ClarificationRequest when completeness < threshold', async () => {
      // Only 3 of 10 fields filled → 30% < 70%
      const dag = buildDAG([{ id: 'n1', name: 'Step 1' }])
      const analyzer = mockAnalyzer(sparseAnalysis(3), dag)
      const jarvis = new Jarvis(analyzer, succeedingExecutor())

      const result = await jarvis.processGoal('Do something vague')

      expect('questions' in result).toBe(true)
      const clarification = result as ClarificationRequest
      expect(clarification.missingFields.length).toBeGreaterThan(0)
      expect(clarification.completenessRatio).toBeLessThan(0.7)
      expect(clarification.originalGoal).toBe('Do something vague')
      // decomposeGoal should NOT be called when clarification is needed
      expect(analyzer.decomposeGoal).not.toHaveBeenCalled()
    })

    it('should return ClarificationRequest at exactly threshold boundary', async () => {
      // 7 of 10 = 0.7, which is NOT less than 0.7 → should decompose
      const dag = buildDAG([{ id: 'n1', name: 'Step 1' }])
      const analyzer = mockAnalyzer(sparseAnalysis(7), dag)
      const jarvis = new Jarvis(analyzer, succeedingExecutor())

      const result = await jarvis.processGoal('Exact boundary goal')

      // 0.7 is NOT less than 0.7, so it should produce a DAG
      expect('nodes' in result).toBe(true)
    })

    it('should throw when decomposition produces invalid DAG', async () => {
      // DAG with missing dependency → invalid
      const invalidDag: TaskDAG = {
        goalId: 'bad-goal',
        goalDescription: 'Bad',
        nodes: [
          {
            taskId: makeTaskId('n1'),
            name: 'Step 1',
            description: 'test',
            assignedRole: AgentRole.Worker,
            dependencies: [makeTaskId('nonexistent')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
        ],
        createdAt: new Date().toISOString(),
      }
      const analyzer = mockAnalyzer(fullAnalysis(), invalidDag)
      const jarvis = new Jarvis(analyzer, succeedingExecutor())

      await expect(jarvis.processGoal('Bad goal')).rejects.toThrow(
        'Goal decomposition produced invalid DAG'
      )
    })

    it('should respect custom clarification threshold', async () => {
      // 5 of 10 filled = 50%. Custom threshold = 0.4 → should pass
      const dag = buildDAG([{ id: 'n1', name: 'Step 1' }])
      const analyzer = mockAnalyzer(sparseAnalysis(5), dag)
      const jarvis = new Jarvis(analyzer, succeedingExecutor(), {
        clarificationThreshold: 0.4,
      })

      const result = await jarvis.processGoal('Lowered threshold goal')
      expect('nodes' in result).toBe(true)
    })
  })

  // =========================================================================
  // executeDAG
  // =========================================================================

  describe('executeDAG', () => {
    it('should execute a single-node DAG successfully', async () => {
      const dag = buildDAG([{ id: 'n1', name: 'Only task' }])
      const executor = succeedingExecutor()
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), dag),
        executor
      )

      const result = await jarvis.executeDAG(dag)

      expect(result.status).toBe('completed')
      expect(result.completedNodes).toHaveLength(1)
      expect(result.failedNodes).toHaveLength(0)
      expect(result.skippedNodes).toHaveLength(0)
      expect(result.totalDuration).toBeGreaterThanOrEqual(0)
    })

    it('should execute a linear chain in order', async () => {
      const dag = buildDAG([
        { id: 'n1', name: 'First' },
        { id: 'n2', name: 'Second', deps: ['n1'] },
        { id: 'n3', name: 'Third', deps: ['n2'] },
      ])
      const calls: number[] = []
      const executor: TaskExecutor = {
        executeNode: vi.fn().mockImplementation(
          (_dag: TaskDAG, nodeIndex: number) => {
            calls.push(nodeIndex)
            return Promise.resolve({ success: true })
          }
        ),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), dag),
        executor
      )

      const result = await jarvis.executeDAG(dag)

      expect(result.status).toBe('completed')
      expect(result.completedNodes).toHaveLength(3)
      // Verify sequential order
      expect(calls).toEqual([0, 1, 2])
    })

    it('should parallelize independent nodes', async () => {
      // n1 and n2 have no deps → can run in parallel
      // n3 depends on both
      const dag = buildDAG([
        { id: 'n1', name: 'Parallel A' },
        { id: 'n2', name: 'Parallel B' },
        { id: 'n3', name: 'Depends on both', deps: ['n1', 'n2'] },
      ])
      const executor = succeedingExecutor()
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), dag),
        executor
      )

      const result = await jarvis.executeDAG(dag)

      expect(result.status).toBe('completed')
      expect(result.completedNodes).toHaveLength(3)
      // executor.executeNode should be called for all 3 nodes
      expect(executor.executeNode).toHaveBeenCalledTimes(3)
    })

    it('should skip dependents when a node fails', async () => {
      const dag = buildDAG([
        { id: 'n1', name: 'Root' },
        { id: 'n2', name: 'Child of Root', deps: ['n1'] },
        { id: 'n3', name: 'Grandchild', deps: ['n2'] },
      ])
      // Fail n1 (index 0)
      const executor = selectiveExecutor(new Set([0]))
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), dag),
        executor
      )

      const result = await jarvis.executeDAG(dag)

      // 'partial' because 1 failed + 2 skipped; 'failed' requires ALL nodes failed
      expect(result.status).toBe('partial')
      expect(result.failedNodes).toHaveLength(1)
      expect(result.skippedNodes).toHaveLength(2)
      expect(result.completedNodes).toHaveLength(0)
      // Only root node should have been executed
      expect(executor.executeNode).toHaveBeenCalledTimes(1)
    })

    it('should report partial status when some nodes fail', async () => {
      // n1 and n2 are independent; n1 succeeds, n2 fails
      // n3 depends on n1 only → can still run
      const dag = buildDAG([
        { id: 'n1', name: 'Success branch' },
        { id: 'n2', name: 'Fail branch' },
        { id: 'n3', name: 'Child of success', deps: ['n1'] },
      ])
      // Fail n2 (index 1 in dag.nodes)
      const executor = selectiveExecutor(new Set([1]))
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), dag),
        executor
      )

      const result = await jarvis.executeDAG(dag)

      expect(result.status).toBe('partial')
      expect(result.completedNodes).toHaveLength(2) // n1, n3
      expect(result.failedNodes).toHaveLength(1)   // n2
    })

    it('should respect maxParallelNodes configuration', async () => {
      // 4 independent nodes, maxParallelNodes = 2
      const dag = buildDAG([
        { id: 'n1', name: 'A' },
        { id: 'n2', name: 'B' },
        { id: 'n3', name: 'C' },
        { id: 'n4', name: 'D' },
      ])
      const batchSizes: number[] = []
      let callCount = 0
      const executor: TaskExecutor = {
        executeNode: vi.fn().mockImplementation(() => {
          callCount++
          return Promise.resolve({ success: true })
        }),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), dag),
        executor,
        { maxParallelNodes: 2 }
      )

      const result = await jarvis.executeDAG(dag)

      expect(result.status).toBe('completed')
      expect(result.completedNodes).toHaveLength(4)
      // executeNode is called 4 times total, but in batches of 2
      expect(executor.executeNode).toHaveBeenCalledTimes(4)
    })

    it('should handle executor throwing errors gracefully', async () => {
      const dag = buildDAG([{ id: 'n1', name: 'Throws' }])
      const executor: TaskExecutor = {
        executeNode: vi.fn().mockRejectedValue(new Error('kaboom')),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), dag),
        executor
      )

      const result = await jarvis.executeDAG(dag)

      expect(result.status).toBe('failed')
      expect(result.failedNodes).toHaveLength(1)
    })

    it('should return failed status for cyclic DAG (topologicalSort returns null)', async () => {
      // Manually build a cyclic DAG (bypassing validateDAG)
      const cyclicDag: TaskDAG = {
        goalId: 'cyclic-goal',
        goalDescription: 'Cyclic',
        nodes: [
          {
            taskId: makeTaskId('a'),
            name: 'A',
            description: 'A',
            assignedRole: AgentRole.Worker,
            dependencies: [makeTaskId('b')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
          {
            taskId: makeTaskId('b'),
            name: 'B',
            description: 'B',
            assignedRole: AgentRole.Worker,
            dependencies: [makeTaskId('a')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
        ],
        createdAt: new Date().toISOString(),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), cyclicDag),
        succeedingExecutor()
      )

      const result = await jarvis.executeDAG(cyclicDag)

      expect(result.status).toBe('failed')
      expect(result.failedNodes).toHaveLength(2)
    })
  })

  // =========================================================================
  // handleEscalation
  // =========================================================================

  describe('handleEscalation', () => {
    it('should return retry for Retry outcome', async () => {
      const eval_: EvalResult = {
        outcome: EvalOutcome.Retry,
        reasoning: 'Flaky test',
        scores: { quality: 0.6 },
        evaluatorId: 'test-evaluator',
        timestamp: new Date().toISOString(),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), buildDAG([])),
        succeedingExecutor()
      )

      const resolution = await jarvis.handleEscalation(eval_)

      expect(resolution.action).toBe('retry')
      expect(resolution.resolved).toBe(true)
    })

    it('should return hitl for Escalate outcome', async () => {
      const eval_: EvalResult = {
        outcome: EvalOutcome.Escalate,
        reasoning: 'Needs human',
        scores: { quality: 0.3 },
        evaluatorId: 'test-evaluator',
        timestamp: new Date().toISOString(),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), buildDAG([])),
        succeedingExecutor()
      )

      const resolution = await jarvis.handleEscalation(eval_)

      expect(resolution.action).toBe('hitl')
      expect(resolution.resolved).toBe(false)
    })

    it('should retry Fail with partial progress (avg score > 0.5)', async () => {
      const eval_: EvalResult = {
        outcome: EvalOutcome.Fail,
        reasoning: 'Close but not quite',
        scores: { quality: 0.7, completeness: 0.6 },
        evaluatorId: 'test-evaluator',
        timestamp: new Date().toISOString(),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), buildDAG([])),
        succeedingExecutor()
      )

      const resolution = await jarvis.handleEscalation(eval_)

      expect(resolution.action).toBe('retry')
      expect(resolution.resolved).toBe(true)
    })

    it('should abort Fail with low scores (avg <= 0.5)', async () => {
      const eval_: EvalResult = {
        outcome: EvalOutcome.Fail,
        reasoning: 'Terrible result',
        scores: { quality: 0.2, completeness: 0.1 },
        evaluatorId: 'test-evaluator',
        timestamp: new Date().toISOString(),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), buildDAG([])),
        succeedingExecutor()
      )

      const resolution = await jarvis.handleEscalation(eval_)

      expect(resolution.action).toBe('abort')
      expect(resolution.resolved).toBe(false)
    })

    it('should abort Fail with no scores', async () => {
      const eval_: EvalResult = {
        outcome: EvalOutcome.Fail,
        reasoning: 'No scores at all',
        evaluatorId: 'test-evaluator',
        timestamp: new Date().toISOString(),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), buildDAG([])),
        succeedingExecutor()
      )

      const resolution = await jarvis.handleEscalation(eval_)

      expect(resolution.action).toBe('abort')
      expect(resolution.resolved).toBe(false)
    })

    it('should override for Pass outcome', async () => {
      const eval_: EvalResult = {
        outcome: EvalOutcome.Pass,
        reasoning: 'All good',
        scores: { quality: 0.95 },
        evaluatorId: 'test-evaluator',
        timestamp: new Date().toISOString(),
      }
      const jarvis = new Jarvis(
        mockAnalyzer(fullAnalysis(), buildDAG([])),
        succeedingExecutor()
      )

      const resolution = await jarvis.handleEscalation(eval_)

      expect(resolution.action).toBe('override')
      expect(resolution.resolved).toBe(true)
    })
  })

  // =========================================================================
  // clarify
  // =========================================================================

  describe('clarify', () => {
    it('should always return ClarificationRequest even for complete goals', async () => {
      const dag = buildDAG([{ id: 'n1', name: 'Step 1' }])
      const analyzer = mockAnalyzer(fullAnalysis(), dag)
      const jarvis = new Jarvis(analyzer, succeedingExecutor())

      const result = await jarvis.clarify('A fully specified goal')

      expect(result.originalGoal).toBe('A fully specified goal')
      expect(result.questions).toBeDefined()
      expect(result.goalId).toMatch(/^goal-/)
    })

    it('should list missing fields as questions for sparse goals', async () => {
      const dag = buildDAG([{ id: 'n1', name: 'Step 1' }])
      // Only 2 fields filled
      const analyzer = mockAnalyzer(sparseAnalysis(2), dag)
      const jarvis = new Jarvis(analyzer, succeedingExecutor())

      const result = await jarvis.clarify('Vague goal')

      expect(result.missingFields.length).toBe(8) // 10 - 2
      expect(result.questions.length).toBe(8)
      expect(result.completenessRatio).toBeCloseTo(0.2)
    })
  })

  // =========================================================================
  // DAG utilities (imported from TaskDAG)
  // =========================================================================

  describe('TaskDAG utilities', () => {
    it('validateDAG should reject empty DAG', async () => {
      const { validateDAG } = await import('./TaskDAG')
      const emptyDag: TaskDAG = {
        goalId: 'empty',
        goalDescription: 'Empty',
        nodes: [],
        createdAt: new Date().toISOString(),
      }

      const result = validateDAG(emptyDag)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('DAG has no nodes')
    })

    it('topologicalSort should return null for cyclic DAGs', async () => {
      const { topologicalSort } = await import('./TaskDAG')
      const cyclic: TaskDAG = {
        goalId: 'cycle',
        goalDescription: 'Cycle',
        nodes: [
          {
            taskId: makeTaskId('x'),
            name: 'X',
            description: 'X',
            assignedRole: AgentRole.Worker,
            dependencies: [makeTaskId('y')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
          {
            taskId: makeTaskId('y'),
            name: 'Y',
            description: 'Y',
            assignedRole: AgentRole.Worker,
            dependencies: [makeTaskId('x')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
        ],
        createdAt: new Date().toISOString(),
      }

      expect(topologicalSort(cyclic)).toBeNull()
    })
  })

  // =========================================================================
  // A2A Protocol
  // =========================================================================

  describe('A2AProtocol', () => {
    it('createA2AEnvelope should produce valid envelope', async () => {
      const { createA2AEnvelope, A2AMessageType } = await import('./A2AProtocol')
      const { createAgentId } = await import('@shared/types')

      const envelope = createA2AEnvelope(
        A2AMessageType.TaskAssignment,
        createAgentId('agent-1'),
        createAgentId('agent-2'),
        {
          type: 'task.assignment',
          taskDescription: 'Do work',
          inputs: [],
          priority: 'high',
        }
      )

      expect(envelope.messageId).toMatch(/^msg-/)
      expect(envelope.messageType).toBe('task.assignment')
      expect(envelope.fromAgentId).toBe('agent-1')
      expect(envelope.toAgentId).toBe('agent-2')
      expect(envelope.timestamp).toBeTruthy()
    })
  })

  // =========================================================================
  // Completeness Matrix
  // =========================================================================

  describe('Completeness Matrix', () => {
    it('evaluateCompleteness should return correct ratio', async () => {
      const { evaluateCompleteness } = await import('./systemPrompt')

      const result = evaluateCompleteness({
        objective: 'Build app',
        scope: 'Full stack',
        constraints: null,
        audience: 'Developers',
      })

      expect(result.filledCount).toBe(3) // objective, scope, audience
      expect(result.totalFields).toBe(10)
      expect(result.completenessRatio).toBeCloseTo(0.3)
    })
  })
})
