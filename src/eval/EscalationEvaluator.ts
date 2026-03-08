import { EvalResult, EvalOutcome, ModelTier } from '@shared/types'
import { IEvaluator, EvalInput } from './IEvaluator'

// ---------------------------------------------------------------------------
// Escalation Provider — abstraction for Frontier-tier model calls
// ---------------------------------------------------------------------------

export interface EscalationProvider {
  evaluate(prompt: string, context: EscalationContext): Promise<EscalationResponse>
}

export interface EscalationContext {
  readonly previousResults: EvalResult[]
  readonly attemptCount: number
  readonly taskType: string
}

export interface EscalationResponse {
  readonly pass: boolean
  readonly confidence: number
  readonly reasoning: string
  readonly recommendation: 'accept' | 'reject' | 'hitl_required'
  readonly scores?: Record<string, number>
}

// ---------------------------------------------------------------------------
// EscalationEvaluator — routes to Frontier-tier (Opus) model
// Only invoked when lower evaluators fail repeatedly (3x at LLM critic)
// or when task is flagged as critical.
// ---------------------------------------------------------------------------

export class EscalationEvaluator implements IEvaluator {
  readonly name = 'escalation'
  readonly modelTier = ModelTier.Frontier

  constructor(private readonly provider: EscalationProvider) {}

  async evaluate(
    input: EvalInput,
    previousResults: EvalResult[] = []
  ): Promise<EvalResult> {
    const context: EscalationContext = {
      previousResults,
      attemptCount: previousResults.length,
      taskType: input.taskType,
    }

    const prompt = this.buildPrompt(input, context)

    try {
      const response = await this.provider.evaluate(prompt, context)

      if (response.recommendation === 'hitl_required') {
        return {
          outcome: EvalOutcome.Escalate,
          scores: {
            confidence: response.confidence,
            ...response.scores,
          },
          reasoning: `Escalation to HITL: ${response.reasoning}`,
          evaluatorId: this.name,
          timestamp: new Date().toISOString(),
        }
      }

      if (response.pass) {
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
        outcome: EvalOutcome.Escalate,
        reasoning: `Escalation evaluator error: ${err instanceof Error ? err.message : 'Unknown error'}. Recommending HITL.`,
        evaluatorId: this.name,
        timestamp: new Date().toISOString(),
      }
    }
  }

  private buildPrompt(input: EvalInput, context: EscalationContext): string {
    const prevSummary = context.previousResults
      .map(
        (r, i) =>
          `Attempt ${i + 1}: ${r.outcome} — ${r.reasoning} (by ${r.evaluatorId})`
      )
      .join('\n')

    return [
      `ESCALATION REVIEW — Task type: "${input.taskType}"`,
      '',
      'Previous evaluation attempts:',
      prevSummary || 'None',
      '',
      'Output to evaluate:',
      JSON.stringify(input.output, null, 2),
      '',
      'You are the final arbiter before human review.',
      'Determine: accept, reject, or require human-in-the-loop review.',
      'Provide confidence score and detailed reasoning.',
    ].join('\n')
  }
}
