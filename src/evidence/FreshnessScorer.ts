export interface FreshnessConfig {
    halfLifeDays: {
        tier_1: number
        tier_2: number
        tier_3: number
    }
}

export interface FreshnessInput {
    tier: 'tier_1' | 'tier_2' | 'tier_3'
    fetchedAt: Date | string
    publishedAt?: Date | string
    now?: Date | string // for testing predictability
}

export interface FreshnessResult {
    freshnessScore: number
    staleAt: string
    confidence: number
}

export class FreshnessScorer {
    private config: FreshnessConfig

    constructor(config?: Partial<FreshnessConfig>) {
        this.config = {
            halfLifeDays: {
                tier_1: 30,
                tier_2: 7,
                tier_3: 1,
                ...config?.halfLifeDays
            }
        }
    }

    score(input: FreshnessInput): FreshnessResult {
        const defaultDate = input.now ? new Date(input.now) : new Date()

        let baseDate = new Date(input.fetchedAt)
        let isFallback = true

        if (input.publishedAt) {
            baseDate = new Date(input.publishedAt)
            isFallback = false
        }

        const halfLife = this.config.halfLifeDays[input.tier] || this.config.halfLifeDays.tier_3
        const halfLifeMs = halfLife * 24 * 60 * 60 * 1000

        const diffMs = defaultDate.getTime() - baseDate.getTime()
        const elapsed = Math.max(0, diffMs)

        // Exponential decay: e.g. at 1 half-life, score is 0.5
        // formula: 0.5 ^ (elapsed / halfLife)
        const score = Math.pow(0.5, elapsed / halfLifeMs)

        const confidence = isFallback ? 0.7 : 1.0
        const staleAt = new Date(baseDate.getTime() + halfLifeMs)

        return {
            freshnessScore: Number(score.toFixed(3)),
            staleAt: staleAt.toISOString(),
            confidence
        }
    }
}
