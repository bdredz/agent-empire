import { describe, expect, it } from 'vitest'
import { RefundPolicyEngine } from './RefundPolicyEngine'

describe('RefundPolicyEngine', () => {
  const now = () => new Date('2026-03-10T12:00:00.000Z')

  it('auto-refunds low-risk low-amount cases', () => {
    const engine = new RefundPolicyEngine({ now })

    const result = engine.evaluate({
      amount: 50,
      purchaseTimestamp: '2026-03-05T12:00:00.000Z',
      reputationScore: 90,
      disputeCount: 0,
    })

    expect(result.decision).toBe('auto_refund')
  })

  it('auto-credits medium-risk cases', () => {
    const engine = new RefundPolicyEngine({ now })

    const result = engine.evaluate({
      amount: 250,
      purchaseTimestamp: '2026-03-01T12:00:00.000Z',
      reputationScore: 70,
      disputeCount: 1,
    })

    expect(result.decision).toBe('auto_credit')
  })

  it('requires manual review for high amount', () => {
    const engine = new RefundPolicyEngine({ now })

    const result = engine.evaluate({
      amount: 5000,
      purchaseTimestamp: '2026-03-05T12:00:00.000Z',
      reputationScore: 85,
      disputeCount: 0,
    })

    expect(result.decision).toBe('manual_review')
  })

  it('applies time decay factor to push stale requests to manual review', () => {
    const engine = new RefundPolicyEngine({ now })

    const result = engine.evaluate({
      amount: 90,
      purchaseTimestamp: '2026-01-01T12:00:00.000Z',
      reputationScore: 95,
      disputeCount: 0,
    })

    expect(result.decision).toBe('manual_review')
  })

  it('uses reputation score as risk factor', () => {
    const engine = new RefundPolicyEngine({ now })

    const result = engine.evaluate({
      amount: 90,
      purchaseTimestamp: '2026-03-05T12:00:00.000Z',
      reputationScore: 20,
      disputeCount: 0,
    })

    expect(result.decision).toBe('manual_review')
  })

  it('uses dispute history as risk factor', () => {
    const engine = new RefundPolicyEngine({ now })

    const result = engine.evaluate({
      amount: 90,
      purchaseTimestamp: '2026-03-05T12:00:00.000Z',
      reputationScore: 90,
      disputeCount: 5,
    })

    expect(result.decision).toBe('manual_review')
  })

  it('respects configurable thresholds', () => {
    const engine = new RefundPolicyEngine({
      now,
      config: {
        lowAmountThreshold: 200,
        disputeLowRiskMax: 1,
      },
    })

    const result = engine.evaluate({
      amount: 150,
      purchaseTimestamp: '2026-03-05T12:00:00.000Z',
      reputationScore: 85,
      disputeCount: 1,
    })

    expect(result.decision).toBe('auto_refund')
  })

  it('treats boundary amount at low threshold as medium risk', () => {
    const engine = new RefundPolicyEngine({ now })

    const result = engine.evaluate({
      amount: 100,
      purchaseTimestamp: '2026-03-05T12:00:00.000Z',
      reputationScore: 90,
      disputeCount: 0,
    })

    expect(result.decision).toBe('auto_credit')
  })
})
