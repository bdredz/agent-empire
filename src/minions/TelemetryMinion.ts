import { EventEmitter } from 'node:events'
import { AgentId, BudgetUsage, EventType, SystemEvent } from '@shared/types'
import { IBudgetGovernor } from '@governor/IBudgetGovernor'

export interface TelemetryAlert {
    readonly type: 'spike' | 'sustained_high_burn'
    readonly agentId: AgentId
    readonly message: string
    readonly severity: 'warning' | 'critical'
}

export interface BurnRate {
    readonly tokensPerMinute: number
    readonly trend: 'rising' | 'stable' | 'falling'
}

export interface ITelemetryMinion {
    recordUsage(agentId: AgentId, usage: Partial<BudgetUsage>): void
    detectAnomalies(agentId: AgentId): TelemetryAlert[]
    getAgentBurnRate(agentId: AgentId): BurnRate
}

export interface TelemetryOptions {
    readonly windowMs: number
    readonly spikeThresholdTokens: number
    readonly sustainedBurnThresholdTokensPerMin: number
}

interface UsageRecord {
    timestamp: number
    tokens: number
}

export class TelemetryMinion implements ITelemetryMinion {
    private readonly usageHistory: Map<string, UsageRecord[]> = new Map()

    constructor(
        private readonly governor: IBudgetGovernor,
        private readonly emitter: EventEmitter,
        private readonly options: TelemetryOptions = {
            windowMs: 5 * 60 * 1000, // 5 minutes
            spikeThresholdTokens: 50000,
            sustainedBurnThresholdTokensPerMin: 20000,
        }
    ) {
        this.emitter.on(EventType.CircuitBreakerTripped, (event: SystemEvent) => {
            if (event.agentId) {
                this.reset(event.agentId)
            }
        })
    }

    public recordUsage(agentId: AgentId, usage: Partial<BudgetUsage>): void {
        const key = agentId as string
        const tokens = usage.tokensUsed ?? 0
        if (tokens === 0) return

        const now = Date.now()
        if (!this.usageHistory.has(key)) {
            this.usageHistory.set(key, [])
        }
        const history = this.usageHistory.get(key)!
        history.push({ timestamp: now, tokens })

        // Prune old
        const cutoff = now - this.options.windowMs
        while (history.length > 0 && history[0]!.timestamp < cutoff) {
            history.shift()
        }

        const anomalies = this.detectAnomalies(agentId)
        for (const anomaly of anomalies) {
            this.emitAlert(anomaly)
        }
    }

    public detectAnomalies(agentId: AgentId): TelemetryAlert[] {
        const key = agentId as string
        const history = this.usageHistory.get(key)
        const alerts: TelemetryAlert[] = []

        if (!history || history.length === 0) {
            return alerts
        }

        // Check for Spike
        const lastRecord = history[history.length - 1]!
        if (lastRecord.tokens >= this.options.spikeThresholdTokens) {
            alerts.push({
                type: 'spike',
                agentId,
                message: `Token spike detected: ${lastRecord.tokens} tokens`,
                severity: 'critical'
            })
        }

        // Check for Sustained High Burn
        const burnRate = this.getAgentBurnRate(agentId)
        if (history.length > 1 && burnRate.tokensPerMinute >= this.options.sustainedBurnThresholdTokensPerMin) {
            alerts.push({
                type: 'sustained_high_burn',
                agentId,
                message: `Sustained high burn rate: ${burnRate.tokensPerMinute.toFixed(0)} tokens/min`,
                severity: 'warning'
            })
        }

        return alerts
    }

    public getAgentBurnRate(agentId: AgentId): BurnRate {
        const key = agentId as string
        const history = this.usageHistory.get(key)

        if (!history || history.length < 2) {
            return { tokensPerMinute: 0, trend: 'stable' }
        }

        const first = history[0]!
        const last = history[history.length - 1]!
        const durationMs = last.timestamp - first.timestamp

        if (durationMs === 0) {
            return { tokensPerMinute: 0, trend: 'stable' }
        }

        const totalTokens = history.reduce((sum, r) => sum + r.tokens, 0)
        const tokensPerMinute = (totalTokens / durationMs) * 60000

        // To determine trend, compare first half and second half rates
        const midPoint = first.timestamp + durationMs / 2
        let firstHalfTokens = 0
        let secondHalfTokens = 0

        for (const r of history) {
            if (r.timestamp <= midPoint) firstHalfTokens += r.tokens
            else secondHalfTokens += r.tokens
        }

        let trend: 'rising' | 'stable' | 'falling' = 'stable'

        // Very simple trend diff
        if (secondHalfTokens > firstHalfTokens * 1.2) trend = 'rising'
        else if (firstHalfTokens > secondHalfTokens * 1.2) trend = 'falling'

        return { tokensPerMinute, trend }
    }

    private reset(agentId: AgentId): void {
        this.usageHistory.delete(agentId as string)
    }

    private emitAlert(anomaly: TelemetryAlert): void {
        const event: SystemEvent = {
            eventId: `telemetry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            eventType: EventType.BudgetWarning,
            timestamp: new Date().toISOString(),
            agentId: anomaly.agentId,
            payload: {
                anomalyType: anomaly.type,
                message: anomaly.message
            },
            severity: anomaly.severity
        }

        // As instructed: "Emits structured SystemEvent telemetry alerts"
        this.emitter.emit(EventType.BudgetWarning, event)
    }
}
