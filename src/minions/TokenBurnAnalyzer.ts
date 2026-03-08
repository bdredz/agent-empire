import { Budget, BudgetUsage, ModelTier } from '@shared/types'

export interface ITokenBurnAnalyzer {
    suggestModelTier(taskType: string, historicalUsage: BudgetUsage[]): ModelTier
    suggestBudgetOverride(taskType: string, historicalUsage: BudgetUsage[], currentBudget: Budget): Partial<Budget>
}

export interface BurnAnalyzerConfig {
    readonly frontierThresholdTokens: number
    readonly budgetShrinkMultiplier: number
    readonly budgetExpandMultiplier: number
    readonly highUsagePercentile: number // e.g., 0.9 for 90th percentile to guess budget
}

export class TokenBurnAnalyzer implements ITokenBurnAnalyzer {
    constructor(
        private readonly config: BurnAnalyzerConfig = {
            frontierThresholdTokens: 20000,
            budgetShrinkMultiplier: 0.8,
            budgetExpandMultiplier: 1.5,
            highUsagePercentile: 0.9
        }
    ) { }

    public suggestModelTier(taskType: string, historicalUsage: BudgetUsage[]): ModelTier {
        if (historicalUsage.length === 0) {
            // Default to fast if no history, to save money
            return 'fast'
        }

        // Use average token usage as heuristic
        const totalTokens = historicalUsage.reduce((sum, u) => sum + u.tokensUsed, 0)
        const avgTokens = totalTokens / historicalUsage.length

        if (avgTokens >= this.config.frontierThresholdTokens) {
            return 'frontier'
        }

        return 'fast'
    }

    public suggestBudgetOverride(taskType: string, historicalUsage: BudgetUsage[], currentBudget: Budget): Partial<Budget> {
        if (historicalUsage.length === 0) {
            return {} // No override suggested
        }

        // Find the 90th percentile of token usage as the safe upper bound
        const sortedTokens = historicalUsage.map(u => u.tokensUsed).sort((a, b) => a - b)
        const p90Index = Math.floor(sortedTokens.length * this.config.highUsagePercentile)
        const p90Tokens = sortedTokens[p90Index] ?? 0

        // Also get Max Tokens used to be safe
        const maxHistorical = sortedTokens[sortedTokens.length - 1] ?? 0

        let maxTokensOverride: number | undefined
        let maxToolCallsOverride: number | undefined

        // If historically very small (even maximum was < 50% of current maxTokens)
        if (maxHistorical < currentBudget.maxTokens * 0.5) {
            maxTokensOverride = Math.max(1000, Math.floor(currentBudget.maxTokens * this.config.budgetShrinkMultiplier))
        }
        // If historically large (p90 is dangerously close to current maxTokens)
        else if (p90Tokens > currentBudget.maxTokens * 0.8) {
            maxTokensOverride = Math.floor(currentBudget.maxTokens * this.config.budgetExpandMultiplier)
        }

        // Same heuristic for tool calls (if available)
        const maxToolCalls = Math.max(...historicalUsage.map(u => u.toolCallsUsed))
        if (maxToolCalls < currentBudget.maxToolCalls * 0.2) { // very few tools
            maxToolCallsOverride = Math.max(1, Math.floor(currentBudget.maxToolCalls * this.config.budgetShrinkMultiplier))
        }

        return {
            ...(maxTokensOverride !== undefined ? { maxTokens: maxTokensOverride } : {}),
            ...(maxToolCallsOverride !== undefined ? { maxToolCalls: maxToolCallsOverride } : {})
        }
    }
}
