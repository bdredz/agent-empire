import { EvalResult, EvalOutcome } from '@shared/types'
import { IEvaluator, EvalInput } from './IEvaluator'

// ---------------------------------------------------------------------------
// Check definition — a single deterministic check
// ---------------------------------------------------------------------------

export interface DeterministicCheck {
  readonly name: string
  readonly check: (output: unknown) => boolean
  readonly errorMessage: string
}

// ---------------------------------------------------------------------------
// Schema check — validates output against expected shape
// ---------------------------------------------------------------------------

export interface SchemaCheck {
  readonly name: string
  readonly validate: (output: unknown) => { valid: boolean; errors: string[] }
}

// ---------------------------------------------------------------------------
// DeterministicEvaluator — pure code, no LLM calls
// Runs schema validation, custom checks, regex patterns.
// This is the first gate: cheap, fast, deterministic.
// ---------------------------------------------------------------------------

export class DeterministicEvaluator implements IEvaluator {
  readonly name = 'deterministic'

  constructor(
    private readonly checks: DeterministicCheck[] = [],
    private readonly schemaChecks: SchemaCheck[] = []
  ) {}

  async evaluate(input: EvalInput): Promise<EvalResult> {
    const failures: string[] = []
    const scores: Record<string, number> = {}

    // Run schema checks first
    for (const sc of this.schemaChecks) {
      const result = sc.validate(input.output)
      scores[`schema:${sc.name}`] = result.valid ? 1.0 : 0.0
      if (!result.valid) {
        failures.push(`Schema "${sc.name}": ${result.errors.join(', ')}`)
      }
    }

    // Run deterministic checks
    for (const check of this.checks) {
      try {
        const passed = check.check(input.output)
        scores[`check:${check.name}`] = passed ? 1.0 : 0.0
        if (!passed) {
          failures.push(`Check "${check.name}": ${check.errorMessage}`)
        }
      } catch (err) {
        scores[`check:${check.name}`] = 0.0
        failures.push(
          `Check "${check.name}" threw: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      }
    }

    const totalChecks = this.checks.length + this.schemaChecks.length
    const passedChecks = totalChecks - failures.length

    if (failures.length === 0) {
      return {
        outcome: EvalOutcome.Pass,
        scores,
        reasoning: `All ${totalChecks} deterministic checks passed`,
        evaluatorId: this.name,
        timestamp: new Date().toISOString(),
      }
    }

    // Partial failures get Retry, total failures get Fail
    const outcome =
      passedChecks > 0 ? EvalOutcome.Retry : EvalOutcome.Fail

    return {
      outcome,
      scores,
      reasoning: `${failures.length}/${totalChecks} checks failed: ${failures.join('; ')}`,
      evaluatorId: this.name,
      timestamp: new Date().toISOString(),
    }
  }
}
