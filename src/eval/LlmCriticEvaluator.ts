import { EvalResult, EvalOutcome, ModelTier } from '@shared/types'
import { IEvaluator, EvalInput } from './IEvaluator'

// ---------------------------------------------------------------------------
// LLM Critic Provider — abstraction for model calls
// Allows injection of mock providers in tests.
// ---------------------------------------------------------------------------

export interface LlmCriticProvider {
  evaluate(prompt: string): Promise<LlmCriticResponse>
}

export interface LlmCriticResponse {
  readonly pass: boolean
  readonly confidence: number  // 0.0 - 1.0
  readonly reasoning: string
  readonly scores?: Record<string, number>
}

// ---------------------------------------------------------------------------
// LlmCriticEvaluator — uses Fast-tier model for quality assessment
// Only runs if deterministic evaluation passes.
// Assesses quality, coherence, and compliance.
// ---------------------------------------------------------------------------

export class LlmCriticEvaluator implements IEvaluator {
  readonly name = 'llm_critic'
  readonly modelTier = ModelTier.Fast

  constructor(
    private readonly provider: LlmCriticProvider,
    private readonly minConfidence: number = 0.7
  ) {}

  async evaluate(input: EvalInput): Promise<EvalResult> {
    const prompt = this.buildPrompt(input)

    try {
      const response = await this.provider.evaluate(prompt)

      if (response.pass && response.confidence >= this.minConfidence) {
        return {
          outcome: EvalOutcome.Pass,
          scores: {
            confidence: response.confidence,
            ...response.scores,
          },
          reasoning: response.reasoning,
          evaluatorId: this.name,
          timestamp: new Date().toISOString(),
        }
      }

      // Below confidence threshold or explicit fail
      return {
        outcome: EvalOutcome.Fail,
        scores: {
          confidence: response.confidence,
          ...response.scores,
        },
        reasoning: response.reasoning,
        evaluatorId: this.name,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      return {
        outcome: EvalOutcome.Fail,
        reasoning: `LLM critic error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        evaluatorId: this.name,
        timestamp: new Date().toISOString(),
      }
    }
  }

  private buildPrompt(input: EvalInput): string {
    return [
      `Evaluate the following output for task type "${input.taskType}".`,
      `Artifacts referenced: ${input.artifacts.join(', ') || 'none'}`,
      '',
      'Output to evaluate:',
      JSON.stringify(input.output, null, 2),
      '',
      'Assess: quality, coherence, completeness, compliance with task requirements.',
      `Respond with pass/fail, confidence (0.0-1.0), and reasoning.`,
    ].join('\n')
  }
}
