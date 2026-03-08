import { describe, it, expect, beforeEach } from 'vitest'
import { TokenBurnAnalyzer } from './TokenBurnAnalyzer'
import { Budget, BudgetUsage } from '@shared/types'

describe('TokenBurnAnalyzer', () => {
    let analyzer: TokenBurnAnalyzer
    const budgetTemplate: Budget = {
        maxTokens: 50000,
        maxToolCalls: 200,
        maxWallTimeSec: 600,
        maxCostUnits: 500
    }

    const makeUsage = (tokens: number, toolCalls = 10): BudgetUsage => ({
        tokensUsed: tokens,
        toolCallsUsed: toolCalls,
        wallTimeElapsedSec: 60,
        costUnitsUsed: 5
    })

    beforeEach(() => {
        // defaults: frontierThresholdTokens: 20000,
        // budgetShrinkMultiplier: 0.8,
        // budgetExpandMultiplier: 1.5,
        analyzer = new TokenBurnAnalyzer()
    })

    it('1. should suggest "fast" model tier when history is empty', () => {
        const override = analyzer.suggestModelTier('some-task', [])
        expect(override).toBe('fast')
    })

    it('2. should not suggest any budget override when history is empty', () => {
        const override = analyzer.suggestBudgetOverride('some-task', [], budgetTemplate)
        expect(override).toEqual({})
    })

    it('3. should suggest "fast" model tier for historically low usage', () => {
        const history = [
            makeUsage(500),
            makeUsage(1000),
            makeUsage(1500) // avg 1000
        ]
        const tier = analyzer.suggestModelTier('easy-task', history)
        expect(tier).toBe('fast')
    })

    it('4. should suggest "frontier" model tier for historically high usage', () => {
        const history = [
            makeUsage(20000),
            makeUsage(30000),
            makeUsage(25000) // avg 25000 (above threshold 20000)
        ]
        const tier = analyzer.suggestModelTier('hard-task', history)
        expect(tier).toBe('frontier')
    })

    it('5. should suggest shrinking budget if historically very small', () => {
        // Current maxTokens = 50,000. History max is 10,000.
        const history = [
            makeUsage(100),
            makeUsage(5000),
            makeUsage(10000)
        ]
        const override = analyzer.suggestBudgetOverride('compact-task', history, budgetTemplate)

        // Expect maxTokens to shrink to 80% (budgetShrinkMultiplier = 0.8)
        expect(override.maxTokens).toBe(40000)

        // History max tool calls = 10 (which is < 20% of 200). Expect tool calls to shrink too
        expect(override.maxToolCalls).toBe(160) // 200 * 0.8
    })

    it('6. should suggest expanding budget if historically close to max', () => {
        // Current maxTokens = 50,000. History has 45,000 consistently
        const history = [
            makeUsage(40000),
            makeUsage(45000),
            makeUsage(46000),
            makeUsage(49000),
            // high usage percentile will be high (e.g., 49000). 
        ]
        const override = analyzer.suggestBudgetOverride('heavy-task', history, budgetTemplate)

        // Expect maxTokens to expand by 1.5x
        expect(override.maxTokens).toBe(75000) // 50000 * 1.5
    })

    it('7. should not override if usage is moderate', () => {
        // Current maxTokens = 50,000. History max = 30000 (below 80% threshold, but above 50% max)
        const history = [
            makeUsage(25000),
            makeUsage(28000),
            makeUsage(32000)
        ]
        const override = analyzer.suggestBudgetOverride('moderate-task', history, budgetTemplate)

        // No tokens override expected
        expect(override.maxTokens).toBeUndefined()
    })
})
