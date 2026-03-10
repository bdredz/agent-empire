import { describe, it, expect } from 'vitest'
import { FreshnessScorer } from './FreshnessScorer.js'

describe('FreshnessScorer', () => {
    const scorer = new FreshnessScorer()

    it('scores fresh content close to 1.0', () => {
        const result = scorer.score({
            tier: 'tier_1',
            fetchedAt: '2026-03-01T12:00:00Z',
            publishedAt: '2026-03-01T11:00:00Z',
            now: '2026-03-01T12:00:00Z' // 1 hour elapsed, half-life is 30 days
        })

        expect(result.freshnessScore).toBeGreaterThan(0.99)
        expect(result.confidence).toBe(1.0)
    })

    it('scores stale content low (at exactly 1 half-life, score is 0.5)', () => {
        const result = scorer.score({
            tier: 'tier_3',
            fetchedAt: '2026-03-01T12:00:00Z',
            publishedAt: '2026-03-01T12:00:00Z',
            now: '2026-03-02T12:00:00Z' // tier_3 default half-life is 1 day
        })

        expect(result.freshnessScore).toBe(0.5)
    })

    it('applies different decay rates based on tier', () => {
        // 7 days elapsed
        const tier1 = scorer.score({
            tier: 'tier_1',
            fetchedAt: '2026-03-01T12:00:00Z',
            publishedAt: '2026-03-01T12:00:00Z',
            now: '2026-03-08T12:00:00Z'
        })

        const tier2 = scorer.score({
            tier: 'tier_2',
            fetchedAt: '2026-03-01T12:00:00Z',
            publishedAt: '2026-03-01T12:00:00Z',
            now: '2026-03-08T12:00:00Z'
        })

        // Tier 2 half life is 7 days, so at 7 days it should be 0.5
        expect(tier2.freshnessScore).toBe(0.5)
        // Tier 1 half life is 30 days, so at 7 days it should be > 0.5
        expect(tier1.freshnessScore).toBeGreaterThan(0.8)
    })

    it('supports custom half-life configuration', () => {
        const customScorer = new FreshnessScorer({
            halfLifeDays: {
                tier_1: 10,  // override to 10 days
                tier_2: 7,
                tier_3: 1
            }
        })

        const result = customScorer.score({
            tier: 'tier_1',
            fetchedAt: '2026-03-01T12:00:00Z',
            publishedAt: '2026-03-01T12:00:00Z',
            now: '2026-03-11T12:00:00Z' // 10 days later
        })

        expect(result.freshnessScore).toBe(0.5) // exactly 1 newly configured half-life
    })

    it('prefers published date over fetch date when provided', () => {
        const result = scorer.score({
            tier: 'tier_3',
            fetchedAt: '2026-03-05T12:00:00Z',    // fetched today
            publishedAt: '2026-03-01T12:00:00Z',  // but published 4 days ago
            now: '2026-03-05T12:00:00Z'
        })

        // Elapsed is 4 days on a 1 day half-life -> 0.5^4 = 0.0625
        expect(result.freshnessScore).toBeLessThan(0.1)
        expect(result.confidence).toBe(1.0)
    })

    it('falls back to fetch date when published date is missing', () => {
        const result = scorer.score({
            tier: 'tier_3',
            fetchedAt: '2026-03-05T12:00:00Z',    // fetched today
            // no published date
            now: '2026-03-05T12:00:00Z'
        })

        // Elapsed is 0
        expect(result.freshnessScore).toBe(1.0)
        // Confidence is reduced because we are falling back to fetch date
        expect(result.confidence).toBe(0.7)
    })
})
