import { EvalResult, EvalOutcome, ModelTier, TaskId } from '@shared/types'
import {
  TaskDAG,
  ExecutionResult,
  DAGNodeStatus,
  getReadyNodes,
  validateDAG,
  topologicalSort,
} from './TaskDAG'
import {
  IJarvis,
  ClarificationRequest,
  Resolution,
  GoalAnalyzer,
  TaskExecutor,
} from './IJarvis'
import {
  evaluateCompleteness,
  CLARIFICATION_THRESHOLD,
  COMPLETENESS_FIELDS,
  CompletenessField,
} from './systemPrompt'
import { nanoid } from 'nanoid'

// ---------------------------------------------------------------------------
// Jarvis Configuration
// ---------------------------------------------------------------------------

export interface JarvisConfig {
  readonly clarificationThreshold: number
  readonly maxParallelNodes: number
  readonly modelTier: ModelTier
}

const DEFAULT_CONFIG: JarvisConfig = {
  clarificationThreshold: CLARIFICATION_THRESHOLD,
  maxParallelNodes: 5,
  modelTier: ModelTier.Frontier,
}

// ---------------------------------------------------------------------------
// Jarvis — the brain of Agent Empire
//
// Receives goals, constructs task DAGs, delegates to agents.
// NEVER executes tasks directly — always delegates.
// ---------------------------------------------------------------------------

export class Jarvis implements IJarvis {
  private readonly config: JarvisConfig

  constructor(
    private readonly goalAnalyzer: GoalAnalyzer,
    private readonly taskExecutor: TaskExecutor,
    config: Partial<JarvisConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // -----------------------------------------------------------------------
  // processGoal — analyze and either decompose or request clarification
  // -----------------------------------------------------------------------

  async processGoal(goal: string): Promise<TaskDAG | ClarificationRequest> {
    const analysis = await this.goalAnalyzer.analyzeGoal(goal)
    const completeness = evaluateCompleteness(analysis.fields)

    if (completeness.completenessRatio < this.config.clarificationThreshold) {
      return this.buildClarificationRequest(goal, completeness)
    }

    const dag = await this.goalAnalyzer.decomposeGoal(goal, analysis)
    const validation = validateDAG(dag)

    if (!validation.valid) {
      throw new Error(
        `Goal decomposition produced invalid DAG: ${validation.errors.join('; ')}`
      )
    }

    return dag
  }

  // -----------------------------------------------------------------------
  // executeDAG — execute nodes in topological order, parallelizing when safe
  // -----------------------------------------------------------------------

  async executeDAG(dag: TaskDAG): Promise<ExecutionResult> {
    const startTime = Date.now()
    const completed: TaskId[] = []
    const failed: TaskId[] = []
    const skipped: TaskId[] = []

    // Mutable copy of node statuses
    const statuses = new Map<TaskId, DAGNodeStatus>(
      dag.nodes.map((n) => [n.taskId, n.status])
    )

    // Mark all initial nodes as pending
    for (const node of dag.nodes) {
      statuses.set(node.taskId, DAGNodeStatus.Pending)
    }

    const sortedNodes = topologicalSort(dag)
    if (!sortedNodes) {
      return {
        goalId: dag.goalId,
        status: 'failed',
        completedNodes: [],
        failedNodes: dag.nodes.map((n) => n.taskId),
        skippedNodes: [],
        totalDuration: Date.now() - startTime,
      }
    }

    // Execute in waves — each wave contains nodes whose deps are all done
    let progress = true
    while (progress) {
      progress = false

      // Find ready nodes (pending with all deps succeeded)
      const ready = dag.nodes.filter((n) => {
        if (statuses.get(n.taskId) !== DAGNodeStatus.Pending) return false
        return n.dependencies.every(
          (dep) => statuses.get(dep) === DAGNodeStatus.Succeeded
        )
      })

      if (ready.length === 0) break

      // Execute batch (up to maxParallelNodes)
      const batch = ready.slice(0, this.config.maxParallelNodes)

      for (const node of batch) {
        statuses.set(node.taskId, DAGNodeStatus.Running)
      }

      const results = await Promise.all(
        batch.map(async (node) => {
          const nodeIndex = dag.nodes.findIndex(
            (n) => n.taskId === node.taskId
          )
          try {
            return await this.taskExecutor.executeNode(dag, nodeIndex)
          } catch {
            return { success: false, errorMessage: 'Execution threw' }
          }
        })
      )

      for (let i = 0; i < batch.length; i++) {
        const node = batch[i]!
        const result = results[i]!

        if (result.success) {
          statuses.set(node.taskId, DAGNodeStatus.Succeeded)
          completed.push(node.taskId)
        } else {
          statuses.set(node.taskId, DAGNodeStatus.Failed)
          failed.push(node.taskId)

          // Skip all downstream dependents
          this.skipDependents(dag, node.taskId, statuses, skipped)
        }
        progress = true
      }
    }

    // Determine overall status
    const allNodes = dag.nodes.length
    const status =
      completed.length === allNodes
        ? 'completed'
        : failed.length === allNodes
          ? 'failed'
          : 'partial'

    return {
      goalId: dag.goalId,
      status,
      completedNodes: completed,
      failedNodes: failed,
      skippedNodes: skipped,
      totalDuration: Date.now() - startTime,
    }
  }

  // -----------------------------------------------------------------------
  // handleEscalation — decide what to do when evaluation fails
  // -----------------------------------------------------------------------

  async handleEscalation(evalResult: EvalResult): Promise<Resolution> {
    if (evalResult.outcome === EvalOutcome.Retry) {
      return {
        resolved: true,
        action: 'retry',
        reasoning: `Evaluation suggests retry: ${evalResult.reasoning}`,
      }
    }

    if (evalResult.outcome === EvalOutcome.Escalate) {
      return {
        resolved: false,
        action: 'hitl',
        reasoning: `Escalation to human required: ${evalResult.reasoning}`,
      }
    }

    if (evalResult.outcome === EvalOutcome.Fail) {
      // Check if scores indicate partial progress
      const avgScore = evalResult.scores
        ? Object.values(evalResult.scores).reduce((a, b) => a + b, 0) /
        Object.values(evalResult.scores).length
        : 0

      if (avgScore > 0.5) {
        return {
          resolved: true,
          action: 'retry',
          reasoning: `Partial progress (avg score ${avgScore.toFixed(2)}), retrying`,
        }
      }

      return {
        resolved: false,
        action: 'abort',
        reasoning: `Task failed with low scores: ${evalResult.reasoning}`,
      }
    }

    return {
      resolved: true,
      action: 'override',
      reasoning: `Evaluation passed: ${evalResult.reasoning}`,
    }
  }

  // -----------------------------------------------------------------------
  // clarify — always returns clarification request for a goal
  // -----------------------------------------------------------------------

  async clarify(goal: string): Promise<ClarificationRequest> {
    const analysis = await this.goalAnalyzer.analyzeGoal(goal)
    const completeness = evaluateCompleteness(analysis.fields)
    return this.buildClarificationRequest(goal, completeness)
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildClarificationRequest(
    goal: string,
    completeness: ReturnType<typeof evaluateCompleteness>
  ): ClarificationRequest {
    const missing = COMPLETENESS_FIELDS.filter(
      (f) => !completeness.fields[f] || completeness.fields[f]!.trim() === ''
    ) as CompletenessField[]

    const questions = missing.map((field) => {
      const questionMap: Record<CompletenessField, string> = {
        objective: 'What is the specific desired outcome?',
        scope: 'What are the boundaries of this work?',
        constraints: 'Are there budget, time, or quality constraints?',
        audience: 'Who is the end user or consumer?',
        success_criteria: 'How will we know this is complete and correct?',
        dependencies: 'What must exist or be true before starting?',
        risk_tolerance: 'How much failure is acceptable?',
        approval_required: 'Does this require human approval before execution?',
        timeline: 'When does this need to be complete?',
        priority: 'How urgent is this relative to other work?',
      }
      return questionMap[field]
    })

    return {
      goalId: `goal-${nanoid()}`,
      originalGoal: goal,
      missingFields: missing,
      questions,
      completenessRatio: completeness.completenessRatio,
    }
  }

  private skipDependents(
    dag: TaskDAG,
    failedId: TaskId,
    statuses: Map<TaskId, DAGNodeStatus>,
    skipped: TaskId[]
  ): void {
    for (const node of dag.nodes) {
      if (
        node.dependencies.includes(failedId) &&
        statuses.get(node.taskId) === DAGNodeStatus.Pending
      ) {
        statuses.set(node.taskId, DAGNodeStatus.Skipped)
        skipped.push(node.taskId)
        // Recursively skip downstream
        this.skipDependents(dag, node.taskId, statuses, skipped)
      }
    }
  }
}
