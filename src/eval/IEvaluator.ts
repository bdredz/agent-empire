import { EvalResult, ArtifactId } from '@shared/types'

// ---------------------------------------------------------------------------
// Evaluation Input — what gets evaluated
// ---------------------------------------------------------------------------

export interface EvalInput {
  readonly taskType: string
  readonly artifacts: ArtifactId[]
  readonly output: unknown
  readonly metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Evaluator Interface — all evaluator stages implement this
// ---------------------------------------------------------------------------

export interface IEvaluator {
  readonly name: string
  evaluate(input: EvalInput): Promise<EvalResult>
}

// ---------------------------------------------------------------------------
// Pipeline Configuration
// ---------------------------------------------------------------------------

export interface EvalPipelineConfig {
  readonly maxRetries: number           // retries at deterministic stage
  readonly maxCriticFailures: number    // failures before escalation (default 3)
  readonly enableEscalation: boolean    // whether to escalate to Opus
  readonly enableHitl: boolean          // whether to escalate to human
}

export const DEFAULT_PIPELINE_CONFIG: EvalPipelineConfig = {
  maxRetries: 2,
  maxCriticFailures: 3,
  enableEscalation: true,
  enableHitl: true,
}

// ---------------------------------------------------------------------------
// Pipeline Stage Result — tracks which stage produced the result
// ---------------------------------------------------------------------------

export type EvalStage = 'deterministic' | 'llm_critic' | 'escalation' | 'hitl'

export interface PipelineResult {
  readonly finalResult: EvalResult
  readonly stage: EvalStage
  readonly stageResults: Array<{
    readonly stage: EvalStage
    readonly result: EvalResult
    readonly attemptNumber: number
  }>
  readonly totalAttempts: number
}
