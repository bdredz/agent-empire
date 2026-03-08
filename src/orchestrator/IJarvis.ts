import { EvalResult, PlanEnvelope, EscalationPolicy, EscalationReason, RetrievalPolicy, Budget } from '@shared/types'
import { TaskDAG, ExecutionResult } from './TaskDAG'
import { CompletenessField } from './systemPrompt'

// ---------------------------------------------------------------------------
// Clarification Request — returned when goal is underspecified
// ---------------------------------------------------------------------------

export interface ClarificationRequest {
  readonly goalId: string
  readonly originalGoal: string
  readonly missingFields: CompletenessField[]
  readonly questions: string[]
  readonly completenessRatio: number
}

// ---------------------------------------------------------------------------
// Resolution — result of handling an escalation
// ---------------------------------------------------------------------------

export interface Resolution {
  readonly resolved: boolean
  readonly action: 'retry' | 'override' | 'abort' | 'hitl'
  readonly reasoning: string
  readonly modifiedTaskId?: string
}

// ---------------------------------------------------------------------------
// Goal Analyzer — abstraction for LLM-based goal decomposition
// Allows injection of mock analyzers in tests.
// ---------------------------------------------------------------------------

export interface GoalAnalyzer {
  analyzeGoal(goal: string): Promise<GoalAnalysis>
  decomposeGoal(goal: string, analysis: GoalAnalysis): Promise<TaskDAG>
}

export interface GoalAnalysis {
  readonly fields: Partial<Record<CompletenessField, string | null>>
  readonly suggestedTasks: string[]
  readonly estimatedComplexity: 'low' | 'medium' | 'high'
}

// ---------------------------------------------------------------------------
// Task Executor — abstraction for executing individual DAG nodes
// ---------------------------------------------------------------------------

export interface TaskExecutor {
  executeNode(
    dag: TaskDAG,
    nodeIndex: number
  ): Promise<NodeExecutionResult>
}

export interface NodeExecutionResult {
  readonly success: boolean
  readonly evalResult?: EvalResult
  readonly errorMessage?: string
}

// ---------------------------------------------------------------------------
// IJarvis Interface
// ---------------------------------------------------------------------------

export interface IJarvis {
  processGoal(goal: string): Promise<TaskDAG | ClarificationRequest>

  /** @deprecated Phase 2: execution ownership moves to Dispatcher. Kept for backward compat. */
  executeDAG(dag: TaskDAG): Promise<ExecutionResult>

  /** Phase 1: Handle escalation from eval result */
  handleEscalation(evalResult: EvalResult): Promise<Resolution>

  /** Phase 2: Handle escalation from Dispatcher */
  handleEscalation(planId: string, reason: EscalationReason): Promise<PlanEnvelope | null>

  clarify(goal: string): Promise<ClarificationRequest>

  /** Phase 2: Jarvis creates a plan and hands off to Dispatcher */
  createPlan(goal: string, tenantId: string): Promise<PlanEnvelope>
}
