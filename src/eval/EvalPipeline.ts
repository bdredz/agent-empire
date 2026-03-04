import { EvalResult, EvalOutcome } from '@shared/types'
import {
  EvalInput,
  EvalPipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
  EvalStage,
  PipelineResult,
} from './IEvaluator'
import { DeterministicEvaluator } from './DeterministicEvaluator'
import { LlmCriticEvaluator } from './LlmCriticEvaluator'
import { EscalationEvaluator } from './EscalationEvaluator'

// ---------------------------------------------------------------------------
// EvalPipeline — Staged evaluation orchestrator
//
// Flow:
//   Deterministic → (pass?) → LlmCritic → (pass?) → accept
//   Deterministic → (fail?) → retry with feedback (up to maxRetries)
//   LlmCritic → (fail 3x?) → Escalation
//   Escalation → (fail?) → HITL
// ---------------------------------------------------------------------------

export class EvalPipeline {
  private readonly config: EvalPipelineConfig

  constructor(
    private readonly deterministic: DeterministicEvaluator,
    private readonly llmCritic: LlmCriticEvaluator,
    private readonly escalation: EscalationEvaluator,
    config: Partial<EvalPipelineConfig> = {}
  ) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config }
  }

  async evaluate(input: EvalInput): Promise<PipelineResult> {
    const stageResults: PipelineResult['stageResults'] = []
    let attempt = 0

    // -----------------------------------------------------------------------
    // Stage 1: Deterministic evaluation (with retries)
    // -----------------------------------------------------------------------
    for (let i = 0; i <= this.config.maxRetries; i++) {
      attempt++
      const result = await this.deterministic.evaluate(input)
      stageResults.push({
        stage: 'deterministic',
        result,
        attemptNumber: attempt,
      })

      if (result.outcome === EvalOutcome.Pass) {
        // Deterministic passed — proceed to LLM critic
        break
      }

      if (result.outcome === EvalOutcome.Fail) {
        // Total failure at deterministic — no point retrying
        return {
          finalResult: result,
          stage: 'deterministic',
          stageResults,
          totalAttempts: attempt,
        }
      }

      // Retry outcome — try again if retries remain
      if (i === this.config.maxRetries) {
        // Exhausted retries at deterministic stage
        return {
          finalResult: result,
          stage: 'deterministic',
          stageResults,
          totalAttempts: attempt,
        }
      }
    }

    // Check if deterministic stage actually passed
    const lastDeterministic = stageResults[stageResults.length - 1]!
    if (lastDeterministic.result.outcome !== EvalOutcome.Pass) {
      return {
        finalResult: lastDeterministic.result,
        stage: 'deterministic',
        stageResults,
        totalAttempts: attempt,
      }
    }

    // -----------------------------------------------------------------------
    // Stage 2: LLM Critic evaluation (up to maxCriticFailures)
    // -----------------------------------------------------------------------
    let criticFailures = 0

    for (let i = 0; i < this.config.maxCriticFailures; i++) {
      attempt++
      const result = await this.llmCritic.evaluate(input)
      stageResults.push({
        stage: 'llm_critic',
        result,
        attemptNumber: attempt,
      })

      if (result.outcome === EvalOutcome.Pass) {
        return {
          finalResult: result,
          stage: 'llm_critic',
          stageResults,
          totalAttempts: attempt,
        }
      }

      criticFailures++
    }

    // -----------------------------------------------------------------------
    // Stage 3: Escalation to Frontier-tier model
    // -----------------------------------------------------------------------
    if (!this.config.enableEscalation) {
      const lastCritic = stageResults[stageResults.length - 1]!
      return {
        finalResult: lastCritic.result,
        stage: 'llm_critic',
        stageResults,
        totalAttempts: attempt,
      }
    }

    const previousResults = stageResults.map((sr) => sr.result)
    attempt++
    const escalationResult = await this.escalation.evaluate(
      input,
      previousResults
    )
    stageResults.push({
      stage: 'escalation',
      result: escalationResult,
      attemptNumber: attempt,
    })

    if (escalationResult.outcome === EvalOutcome.Pass) {
      return {
        finalResult: escalationResult,
        stage: 'escalation',
        stageResults,
        totalAttempts: attempt,
      }
    }

    // -----------------------------------------------------------------------
    // Stage 4: HITL (represented as Escalate outcome)
    // -----------------------------------------------------------------------
    if (
      this.config.enableHitl &&
      escalationResult.outcome === EvalOutcome.Escalate
    ) {
      // Pipeline returns escalate — caller routes to HITL system
      return {
        finalResult: escalationResult,
        stage: 'hitl',
        stageResults,
        totalAttempts: attempt,
      }
    }

    // Escalation failed without HITL
    return {
      finalResult: escalationResult,
      stage: 'escalation',
      stageResults,
      totalAttempts: attempt,
    }
  }
}
