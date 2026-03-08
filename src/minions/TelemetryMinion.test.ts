import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TelemetryMinion } from './TelemetryMinion'
import { IBudgetGovernor } from '@governor/IBudgetGovernor'
import { createAgentId, EventType, SystemEvent } from '@shared/types'

describe('TelemetryMinion', () => {
    let minion: TelemetryMinion
    let emitter: EventEmitter
    let governor: Readonly<IBudgetGovernor>

    const originalDateNow = Date.now

    beforeEach(() => {
        emitter = new EventEmitter()
        governor = {
            allocate: vi.fn(),
            recordUsage: vi.fn(),
            checkBudget: vi.fn(),
            tripCircuitBreaker: vi.fn(),
            getUsage: vi.fn()
        }

        minion = new TelemetryMinion(governor, emitter, {
            windowMs: 60000,
            spikeThresholdTokens: 5000,
            sustainedBurnThresholdTokensPerMin: 2000
        })

        // reset Date.now mock if it was set
        Date.now = originalDateNow
    })

    it('1. should record usage and emit no alerts for normal usage', () => {
        const agentId = createAgentId('agent-1')
        const emitSpy = vi.spyOn(emitter, 'emit')

        minion.recordUsage(agentId, { tokensUsed: 100 })
        minion.recordUsage(agentId, { tokensUsed: 50 })

        const alerts = minion.detectAnomalies(agentId)
        expect(alerts).toHaveLength(0)
        expect(emitSpy).not.toHaveBeenCalled()
    })

    it('2. should detect spike and emit alert', () => {
        const agentId = createAgentId('agent-1')
        const emitSpy = vi.spyOn(emitter, 'emit')

        minion.recordUsage(agentId, { tokensUsed: 6000 })

        // emitAlert should have been called
        expect(emitSpy).toHaveBeenCalledWith(EventType.BudgetWarning, expect.any(Object))

        const alerts = minion.detectAnomalies(agentId)
        expect(alerts).toHaveLength(1)
        expect(alerts[0]!.type).toBe('spike')
        expect(alerts[0]!.severity).toBe('critical')
    })

    it('3. should detect sustained burn across multiple records', () => {
        const agentId = createAgentId('agent-1')
        let time = 1000
        Date.now = () => time

        minion.recordUsage(agentId, { tokensUsed: 1000 })

        time += 30000 // 30 seconds later
        minion.recordUsage(agentId, { tokensUsed: 1000 })

        time += 30000 // 60 seconds (total 2000 tokens / min = threshold)
        minion.recordUsage(agentId, { tokensUsed: 500 }) // Over 2000 per min

        const alerts = minion.detectAnomalies(agentId)
        const sustainedAlert = alerts.find(a => a.type === 'sustained_high_burn')
        expect(sustainedAlert).toBeDefined()
        expect(sustainedAlert!.severity).toBe('warning')
    })

    it('4. should calculate burn rate properly', () => {
        const agentId = createAgentId('agent-1')
        let time = 1000
        Date.now = () => time

        minion.recordUsage(agentId, { tokensUsed: 1000 })

        time += 30000 // 30 sec later
        minion.recordUsage(agentId, { tokensUsed: 1000 }) // 2000 tokens in 30 sec = 4000 per min

        const rate = minion.getAgentBurnRate(agentId)
        expect(rate.tokensPerMinute).toBeCloseTo(4000)
    })

    it('5. should detect trend (rising and falling)', () => {
        const agentId1 = createAgentId('agent-rising')
        const agentId2 = createAgentId('agent-falling')

        let time = 10000
        Date.now = () => time

        // Rising: low tokens early, high tokens later
        minion.recordUsage(agentId1, { tokensUsed: 100 })
        minion.recordUsage(agentId2, { tokensUsed: 1000 })

        time += 30000
        minion.recordUsage(agentId1, { tokensUsed: 1000 })
        minion.recordUsage(agentId2, { tokensUsed: 100 })

        const rate1 = minion.getAgentBurnRate(agentId1)
        expect(rate1.trend).toBe('rising')

        const rate2 = minion.getAgentBurnRate(agentId2)
        expect(rate2.trend).toBe('falling')
    })

    it('6. should track multiple agents independently', () => {
        const agent1 = createAgentId('agent-1')
        const agent2 = createAgentId('agent-2')

        let time = 1000
        Date.now = () => time

        minion.recordUsage(agent1, { tokensUsed: 6000 }) // Spike!
        minion.recordUsage(agent2, { tokensUsed: 100 })  // Normal

        const alerts1 = minion.detectAnomalies(agent1)
        const alerts2 = minion.detectAnomalies(agent2)

        expect(alerts1[0]!.type).toBe('spike')
        expect(alerts2).toHaveLength(0)
    })

    it('7. should reset on circuit breaker trip event', () => {
        const agentId = createAgentId('agent-1')

        minion.recordUsage(agentId, { tokensUsed: 500 })
        expect(minion.detectAnomalies(agentId)).toEqual([])

        // We should not have empty history
        const burnRateBefore = minion.getAgentBurnRate(agentId)

        // Fire event
        const event: SystemEvent = {
            eventId: 'cb1',
            eventType: EventType.CircuitBreakerTripped,
            timestamp: new Date().toISOString(),
            agentId,
            severity: 'critical',
            payload: { reason: 'max wall time' }
        }
        emitter.emit(EventType.CircuitBreakerTripped, event)

        // Now burn rate calculation should see an empty state and just return { tokensPerMinute: 0, trend: 'stable' }
        const burnRateAfter = minion.getAgentBurnRate(agentId)
        expect(burnRateAfter.tokensPerMinute).toBe(0)
        expect(burnRateAfter.trend).toBe('stable')

        // Detect anomalies also returns empty
        const alerts = minion.detectAnomalies(agentId)
        expect(alerts).toHaveLength(0)
    })

    it('8. should prune old history outside of window', () => {
        const agentId = createAgentId('agent-1')

        let time = 1000
        Date.now = () => time

        // Out of window (60s)
        minion.recordUsage(agentId, { tokensUsed: 3000 })

        time += 120000 // 2 minutes later

        minion.recordUsage(agentId, { tokensUsed: 100 })

        // Total tokens in last 60s is just 100. The earlier 3000 should be pruned.
        // Length is 1, so rate is 0.
        const burnRate = minion.getAgentBurnRate(agentId)
        expect(burnRate.tokensPerMinute).toBe(0)
    })
})
