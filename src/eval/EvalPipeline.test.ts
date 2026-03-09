import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EvalPipeline } from './EvalPipeline'
import { DeterministicEvaluator, DeterministicCheck, SchemaCheck } from './DeterministicEvaluator'
import { LlmCriticEvaluator, LlmCriticProvider } from './LlmCriticEvaluator'
import { EscalationEvaluator, EscalationProvider } from './EscalationEvaluator'
import { EvalInput, EvalPipelineConfig } from './IEvaluator'
import { EvalOutcome, createArtifactId } from '@shared/types'
import { IAuditMinion, AuditVerdict } from '../minions/AuditMinion'

// ---------------------------------------------------------------------------
// Test helpers — mock providers
// ---------------------------------------------------------------------------

function makeMockCriticProvider(
  responses: Array<{ pass: boolean; confidence: number; reasoning: string }>
): LlmCriticProvider {
  let callIndex = 0
  return {
    evaluate: async () => {
      const resp = responses[callIndex] ?? responses[responses.length - 1]!
      callIndex++
      return { ...resp, scores: {} }
    },
  }
}

function makeMockEscalationProvider(response: {
  pass: boolean
  confidence: number
  reasoning: string
  recommendation: 'accept' | 'reject' | 'hitl_required'
}): EscalationProvider {
  return {
    evaluate: async () => ({ ...response, scores: {} }),
  }
}

function makePassingChecks(): DeterministicCheck[] {
  return [
    {
      name: 'not_empty',
      check: (output) => output !== null && output !== undefined,
      errorMessage: 'Output is empty',
    },
  ]
}

function makeFailingChecks(): DeterministicCheck[] {
  return [
    {
      name: 'always_fails',
      check: () => false,
      errorMessage: 'Always fails',
    },
  ]
}

function makePartialFailChecks(): DeterministicCheck[] {
  return [
    {
      name: 'passes',
      check: () => true,
      errorMessage: 'Should pass',
    },
    {
      name: 'fails',
      check: () => false,
      errorMessage: 'Partial failure',
    },
  ]
}

function makeInput(output: unknown = { data: 'test' }): EvalInput {
  return {
    taskType: 'test_task',
    artifacts: [createArtifactId('art-1')],
    output,
  }
}

// ---------------------------------------------------------------------------
// Tests — 15+ covering all pipeline paths
// ---------------------------------------------------------------------------

describe('EvalPipeline', () => {
  // -----------------------------------------------------------------------
  // 1. Full pass: deterministic pass → critic pass → accept
  // -----------------------------------------------------------------------
  it('passes when deterministic and critic both pass', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePassingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([{ pass: true, confidence: 0.9, reasoning: 'Good' }])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({ pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' })
      )
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Pass)
    expect(result.stage).toBe('llm_critic')
  })

  // -----------------------------------------------------------------------
  // 2. Deterministic total fail → returns immediately
  // -----------------------------------------------------------------------
  it('returns fail when deterministic totally fails', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makeFailingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([{ pass: true, confidence: 0.9, reasoning: 'Good' }])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({ pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' })
      )
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Fail)
    expect(result.stage).toBe('deterministic')
    expect(result.totalAttempts).toBe(1) // no retries on total fail
  })

  // -----------------------------------------------------------------------
  // 3. Deterministic partial fail → retries → still fails
  // -----------------------------------------------------------------------
  it('retries deterministic on partial failure then fails', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePartialFailChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([{ pass: true, confidence: 0.9, reasoning: 'Good' }])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({ pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' })
      ),
      { maxRetries: 2, maxCriticFailures: 3, enableEscalation: true, enableHitl: true }
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Retry)
    expect(result.stage).toBe('deterministic')
    expect(result.totalAttempts).toBe(3) // initial + 2 retries
  })

  // -----------------------------------------------------------------------
  // 4. Deterministic pass → critic fails 3x → escalation pass
  // -----------------------------------------------------------------------
  it('escalates after 3 critic failures, then passes at escalation', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePassingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([
          { pass: false, confidence: 0.3, reasoning: 'Poor quality' },
          { pass: false, confidence: 0.4, reasoning: 'Still poor' },
          { pass: false, confidence: 0.2, reasoning: 'No improvement' },
        ])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({ pass: true, confidence: 0.85, reasoning: 'Actually acceptable', recommendation: 'accept' })
      )
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Pass)
    expect(result.stage).toBe('escalation')
  })

  // -----------------------------------------------------------------------
  // 5. Full pipeline to HITL
  // -----------------------------------------------------------------------
  it('reaches HITL when escalation recommends it', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePassingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([
          { pass: false, confidence: 0.3, reasoning: 'Fail' },
          { pass: false, confidence: 0.3, reasoning: 'Fail' },
          { pass: false, confidence: 0.3, reasoning: 'Fail' },
        ])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({
          pass: false,
          confidence: 0.5,
          reasoning: 'Needs human review',
          recommendation: 'hitl_required',
        })
      )
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Escalate)
    expect(result.stage).toBe('hitl')
  })

  // -----------------------------------------------------------------------
  // 6. Escalation disabled — stops at critic
  // -----------------------------------------------------------------------
  it('stops at critic when escalation disabled', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePassingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([{ pass: false, confidence: 0.3, reasoning: 'Fail' }])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({ pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' })
      ),
      { maxRetries: 0, maxCriticFailures: 1, enableEscalation: false, enableHitl: false }
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Fail)
    expect(result.stage).toBe('llm_critic')
  })

  // -----------------------------------------------------------------------
  // 7. Critic passes on first attempt
  // -----------------------------------------------------------------------
  it('critic passes on first attempt without escalation', async () => {
    const escalationSpy = vi.fn()
    const escalationProvider: EscalationProvider = {
      evaluate: async (...args) => {
        escalationSpy(...args)
        return { pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' as const, scores: {} }
      },
    }

    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePassingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([{ pass: true, confidence: 0.95, reasoning: 'Excellent' }])
      ),
      new EscalationEvaluator(escalationProvider)
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Pass)
    expect(result.stage).toBe('llm_critic')
    expect(escalationSpy).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 8. Schema check validation
  // -----------------------------------------------------------------------
  it('deterministic evaluator runs schema checks', async () => {
    const schemaChecks: SchemaCheck[] = [
      {
        name: 'has_data_field',
        validate: (output) => {
          const obj = output as Record<string, unknown>
          if (obj && typeof obj === 'object' && 'data' in obj) {
            return { valid: true, errors: [] }
          }
          return { valid: false, errors: ['Missing data field'] }
        },
      },
    ]

    const evaluator = new DeterministicEvaluator([], schemaChecks)

    const pass = await evaluator.evaluate(makeInput({ data: 'hello' }))
    expect(pass.outcome).toBe(EvalOutcome.Pass)

    const fail = await evaluator.evaluate(makeInput({ wrong: 'field' }))
    expect(fail.outcome).toBe(EvalOutcome.Fail)
  })

  // -----------------------------------------------------------------------
  // 9. Deterministic check that throws is caught
  // -----------------------------------------------------------------------
  it('catches throwing deterministic checks', async () => {
    const checks: DeterministicCheck[] = [
      {
        name: 'throws',
        check: () => { throw new Error('Boom') },
        errorMessage: 'Should not reach',
      },
    ]
    const evaluator = new DeterministicEvaluator(checks)
    const result = await evaluator.evaluate(makeInput())

    expect(result.outcome).toBe(EvalOutcome.Fail)
    expect(result.reasoning).toContain('Boom')
  })

  // -----------------------------------------------------------------------
  // 10. LLM critic below confidence threshold
  // -----------------------------------------------------------------------
  it('critic fails when confidence below threshold', async () => {
    const critic = new LlmCriticEvaluator(
      makeMockCriticProvider([{ pass: true, confidence: 0.3, reasoning: 'Low confidence pass' }]),
      0.7 // min confidence
    )

    const result = await critic.evaluate(makeInput())
    expect(result.outcome).toBe(EvalOutcome.Fail)
  })

  // -----------------------------------------------------------------------
  // 11. LLM critic provider error is caught
  // -----------------------------------------------------------------------
  it('critic handles provider errors gracefully', async () => {
    const errorProvider: LlmCriticProvider = {
      evaluate: async () => { throw new Error('API timeout') },
    }
    const critic = new LlmCriticEvaluator(errorProvider)
    const result = await critic.evaluate(makeInput())

    expect(result.outcome).toBe(EvalOutcome.Fail)
    expect(result.reasoning).toContain('API timeout')
  })

  // -----------------------------------------------------------------------
  // 12. Escalation provider error routes to HITL
  // -----------------------------------------------------------------------
  it('escalation error recommends HITL', async () => {
    const errorProvider: EscalationProvider = {
      evaluate: async () => { throw new Error('Model unavailable') },
    }
    const escalation = new EscalationEvaluator(errorProvider)
    const result = await escalation.evaluate(makeInput())

    expect(result.outcome).toBe(EvalOutcome.Escalate)
    expect(result.reasoning).toContain('Model unavailable')
  })

  // -----------------------------------------------------------------------
  // 13. Pipeline tracks all stage results
  // -----------------------------------------------------------------------
  it('tracks all stage results in pipeline output', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePassingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([
          { pass: false, confidence: 0.3, reasoning: 'Fail 1' },
          { pass: false, confidence: 0.4, reasoning: 'Fail 2' },
          { pass: false, confidence: 0.2, reasoning: 'Fail 3' },
        ])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({ pass: true, confidence: 0.8, reasoning: 'OK', recommendation: 'accept' })
      )
    )

    const result = await pipeline.evaluate(makeInput())

    // 1 deterministic + 3 critic + 1 escalation = 5
    expect(result.stageResults.length).toBe(5)
    expect(result.stageResults[0]!.stage).toBe('deterministic')
    expect(result.stageResults[1]!.stage).toBe('llm_critic')
    expect(result.stageResults[2]!.stage).toBe('llm_critic')
    expect(result.stageResults[3]!.stage).toBe('llm_critic')
    expect(result.stageResults[4]!.stage).toBe('escalation')
    expect(result.totalAttempts).toBe(5)
  })

  // -----------------------------------------------------------------------
  // 14. Escalation reject (not HITL) returns fail
  // -----------------------------------------------------------------------
  it('escalation reject without HITL returns fail', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePassingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([
          { pass: false, confidence: 0.3, reasoning: 'Fail' },
          { pass: false, confidence: 0.3, reasoning: 'Fail' },
          { pass: false, confidence: 0.3, reasoning: 'Fail' },
        ])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({
          pass: false,
          confidence: 0.4,
          reasoning: 'Rejected outright',
          recommendation: 'reject',
        })
      ),
      { maxRetries: 0, maxCriticFailures: 3, enableEscalation: true, enableHitl: true }
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Fail)
    expect(result.stage).toBe('escalation')
  })

  // -----------------------------------------------------------------------
  // 15. Empty checks pass deterministic
  // -----------------------------------------------------------------------
  it('passes deterministic with no checks configured', async () => {
    const evaluator = new DeterministicEvaluator([], [])
    const result = await evaluator.evaluate(makeInput())
    expect(result.outcome).toBe(EvalOutcome.Pass)
    expect(result.reasoning).toContain('0 deterministic checks passed')
  })

  // -----------------------------------------------------------------------
  // 16. Critic fails once then passes on retry
  // -----------------------------------------------------------------------
  it('critic fails once then passes on retry', async () => {
    const pipeline = new EvalPipeline(
      new DeterministicEvaluator(makePassingChecks()),
      new LlmCriticEvaluator(
        makeMockCriticProvider([
          { pass: false, confidence: 0.3, reasoning: 'Not great' },
          { pass: true, confidence: 0.85, reasoning: 'Better now' },
        ])
      ),
      new EscalationEvaluator(
        makeMockEscalationProvider({ pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' })
      )
    )

    const result = await pipeline.evaluate(makeInput())
    expect(result.finalResult.outcome).toBe(EvalOutcome.Pass)
    expect(result.stage).toBe('llm_critic')
    expect(result.totalAttempts).toBe(3) // 1 deterministic + 2 critic
  })

  // -----------------------------------------------------------------------
  // 17. Null output handled by deterministic check
  // -----------------------------------------------------------------------
  it('deterministic check handles null output', async () => {
    const checks: DeterministicCheck[] = [
      {
        name: 'not_null',
        check: (output) => output !== null,
        errorMessage: 'Output is null',
      },
    ]
    const evaluator = new DeterministicEvaluator(checks)

    const result = await evaluator.evaluate(makeInput(null))
    expect(result.outcome).toBe(EvalOutcome.Fail)
    expect(result.reasoning).toContain('Output is null')
  })

  // =========================================================================
  // Phase 2 — Audit front-run
  // =========================================================================

  describe('Phase 2 — Audit front-run', () => {
    function mockAuditMinion(verdict: AuditVerdict): IAuditMinion {
      return { audit: vi.fn().mockReturnValue(verdict) }
    }

    function makePipelineWithAudit(audit: IAuditMinion): EvalPipeline {
      return new EvalPipeline(
        new DeterministicEvaluator(makePassingChecks()),
        new LlmCriticEvaluator(
          makeMockCriticProvider([{ pass: true, confidence: 0.9, reasoning: 'Good' }])
        ),
        new EscalationEvaluator(
          makeMockEscalationProvider({ pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' })
        ),
        {},
        audit
      )
    }

    // -----------------------------------------------------------------------
    // 18. Audit reject → immediate Fail, deterministic never runs
    // -----------------------------------------------------------------------
    it('returns Fail immediately when audit rejects, skipping deterministic stage', async () => {
      const deterministicSpy = vi.fn().mockResolvedValue({
        outcome: EvalOutcome.Pass,
        reasoning: 'Passed',
        evaluatorId: 'deterministic',
        timestamp: new Date().toISOString(),
      })

      const verdict: AuditVerdict = {
        outcome: 'reject',
        issues: [
          { code: 'POLICY_VIOLATION', message: 'Output violates content policy', severity: 'critical' },
        ],
      }
      const audit = mockAuditMinion(verdict)

      const pipeline = new EvalPipeline(
        { evaluate: deterministicSpy, name: 'deterministic' } as unknown as DeterministicEvaluator,
        new LlmCriticEvaluator(
          makeMockCriticProvider([{ pass: true, confidence: 0.9, reasoning: 'Good' }])
        ),
        new EscalationEvaluator(
          makeMockEscalationProvider({ pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' })
        ),
        {},
        audit
      )

      const result = await pipeline.evaluate(makeInput())

      expect(result.finalResult.outcome).toBe(EvalOutcome.Fail)
      expect(result.stage).toBe('audit')
      expect(result.finalResult.reasoning).toContain('Audit rejected')
      expect(result.finalResult.reasoning).toContain('Output violates content policy')
      expect(result.totalAttempts).toBe(1)
      expect(result.stageResults).toHaveLength(1)
      expect(result.stageResults[0]!.stage).toBe('audit')
      expect(deterministicSpy).not.toHaveBeenCalled()
    })

    // -----------------------------------------------------------------------
    // 19. Audit warn → audit result in stageResults, pipeline continues to pass
    // -----------------------------------------------------------------------
    it('records warn in stageResults and allows pipeline to continue to pass', async () => {
      const verdict: AuditVerdict = {
        outcome: 'warn',
        issues: [
          { code: 'QUALITY_LOW', message: 'Output quality is below recommended threshold', severity: 'warning' },
        ],
      }
      const audit = mockAuditMinion(verdict)
      const pipeline = makePipelineWithAudit(audit)

      const result = await pipeline.evaluate(makeInput())

      expect(result.finalResult.outcome).toBe(EvalOutcome.Pass)
      // Audit stage result must be first in stageResults
      const auditStage = result.stageResults.find((sr) => sr.stage === 'audit')
      expect(auditStage).toBeDefined()
      expect(auditStage!.result.reasoning).toContain('Audit warnings')
      expect(auditStage!.result.reasoning).toContain('Output quality is below recommended threshold')
      // Pipeline should still have proceeded through deterministic + llm_critic
      const stages = result.stageResults.map((sr) => sr.stage)
      expect(stages).toContain('deterministic')
      expect(stages).toContain('llm_critic')
    })

    // -----------------------------------------------------------------------
    // 20. Audit pass → no audit stage result, pipeline proceeds normally
    // -----------------------------------------------------------------------
    it('adds no audit stage result when audit passes, pipeline proceeds normally', async () => {
      const verdict: AuditVerdict = {
        outcome: 'pass',
        issues: [],
      }
      const audit = mockAuditMinion(verdict)
      const pipeline = makePipelineWithAudit(audit)

      const result = await pipeline.evaluate(makeInput())

      expect(result.finalResult.outcome).toBe(EvalOutcome.Pass)
      // No audit stage result should be present
      const auditStage = result.stageResults.find((sr) => sr.stage === 'audit')
      expect(auditStage).toBeUndefined()
      // Should have gone through deterministic and llm_critic
      expect(result.stageResults[0]!.stage).toBe('deterministic')
    })

    // -----------------------------------------------------------------------
    // 21. No auditMinion injected → backward compat, works exactly as before
    // -----------------------------------------------------------------------
    it('works exactly as before when no auditMinion is injected (backward compat)', async () => {
      // Pipeline without 5th arg — original 4-arg constructor form
      const pipeline = new EvalPipeline(
        new DeterministicEvaluator(makePassingChecks()),
        new LlmCriticEvaluator(
          makeMockCriticProvider([{ pass: true, confidence: 0.9, reasoning: 'Good' }])
        ),
        new EscalationEvaluator(
          makeMockEscalationProvider({ pass: true, confidence: 0.9, reasoning: 'OK', recommendation: 'accept' })
        )
      )

      const result = await pipeline.evaluate(makeInput())

      expect(result.finalResult.outcome).toBe(EvalOutcome.Pass)
      expect(result.stage).toBe('llm_critic')
      // No audit stage in results
      const hasAuditStage = result.stageResults.some((sr) => sr.stage === 'audit')
      expect(hasAuditStage).toBe(false)
      // Standard flow: deterministic + llm_critic
      expect(result.stageResults).toHaveLength(2)
      expect(result.stageResults[0]!.stage).toBe('deterministic')
      expect(result.stageResults[1]!.stage).toBe('llm_critic')
    })
  })
})
