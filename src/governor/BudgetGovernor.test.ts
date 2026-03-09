import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  Budget,
  BudgetGovernorState,
  EventType,
  createAgentId,
} from '@shared/types'
import { BudgetGovernor } from '@governor/BudgetGovernor'
import { ITelemetryMinion, TelemetryAlert } from '../minions/TelemetryMinion'

const createBudget = (overrides: Partial<Budget> = {}): Budget => ({
  maxTokens: 100,
  maxToolCalls: 50,
  maxWallTimeSec: 200,
  maxCostUnits: 20,
  ...overrides,
})

const createGovernor = (): { governor: BudgetGovernor; statePath: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-governor-'))
  const statePath = join(dir, 'state.json')

  return {
    governor: new BudgetGovernor(statePath),
    statePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

const readState = (statePath: string): BudgetGovernorState =>
  JSON.parse(readFileSync(statePath, 'utf-8')) as BudgetGovernorState

describe('BudgetGovernor', () => {
  it('allocates budget for new agent', () => {
    const { governor, statePath, cleanup } = createGovernor()
    const agentId = createAgentId('agent-1')

    governor.allocate(agentId, createBudget())

    const state = readState(statePath)
    expect(state.agents[agentId]).toBeDefined()
    expect(governor.getUsage(agentId)).toEqual({
      tokensUsed: 0,
      toolCallsUsed: 0,
      wallTimeElapsedSec: 0,
      costUnitsUsed: 0,
    })

    cleanup()
  })

  it('records usage increments', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-2')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { tokensUsed: 10, toolCallsUsed: 2 })

    expect(governor.getUsage(agentId)).toEqual({
      tokensUsed: 10,
      toolCallsUsed: 2,
      wallTimeElapsedSec: 0,
      costUnitsUsed: 0,
    })

    cleanup()
  })

  it('returns within-limits when under budget', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-3')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { tokensUsed: 20, toolCallsUsed: 5, wallTimeElapsedSec: 40 })

    const result = governor.checkBudget(agentId)
    expect(result.withinLimits).toBe(true)
    expect(result.exceeded).toHaveLength(0)

    cleanup()
  })

  it('returns warning at 75% threshold', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-4')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { tokensUsed: 75 })

    const result = governor.checkBudget(agentId)
    expect(result.withinLimits).toBe(true)
    expect(result.warnings).toContain('tokens usage exceeded warning threshold')

    cleanup()
  })

  it('trips circuit breaker at 90% tokens', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-5')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { tokensUsed: 90 })

    const result = governor.checkBudget(agentId)
    expect(result.withinLimits).toBe(false)
    expect(result.exceeded).toContain('tokens usage exceeded trip threshold')

    cleanup()
  })

  it('trips circuit breaker at 90% tool calls', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-6')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { toolCallsUsed: 45 })

    const result = governor.checkBudget(agentId)
    expect(result.withinLimits).toBe(false)
    expect(result.exceeded).toContain('tool calls usage exceeded trip threshold')

    cleanup()
  })

  it('trips circuit breaker at 90% wall time', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-7')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { wallTimeElapsedSec: 180 })

    const result = governor.checkBudget(agentId)
    expect(result.withinLimits).toBe(false)
    expect(result.exceeded).toContain('wall time usage exceeded trip threshold')

    cleanup()
  })

  it('emits correct event on circuit breaker', () => {
    const { governor, statePath, cleanup } = createGovernor()
    const agentId = createAgentId('agent-8')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { tokensUsed: 95 })

    const state = readState(statePath)
    expect(state.events).toHaveLength(1)
    expect(state.events[0]?.eventType).toBe(EventType.CircuitBreakerTripped)
    expect(state.events[0]?.agentId).toBe(agentId)

    cleanup()
  })

  it('rejects usage recording for unknown agent', () => {
    const { governor, cleanup } = createGovernor()

    expect(() => governor.recordUsage(createAgentId('missing-agent'), { tokensUsed: 1 })).toThrow(
      'Unknown agent budget allocation',
    )

    cleanup()
  })

  it('handles concurrent usage recording', async () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-9')

    governor.allocate(agentId, createBudget({ maxTokens: 10_000 }))

    await Promise.all(
      Array.from({ length: 40 }, () => Promise.resolve().then(() => governor.recordUsage(agentId, { tokensUsed: 2 }))),
    )

    expect(governor.getUsage(agentId).tokensUsed).toBe(80)

    cleanup()
  })

  it('tracks cumulative usage across multiple recordings', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-10')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { tokensUsed: 10, toolCallsUsed: 2 })
    governor.recordUsage(agentId, { tokensUsed: 7, wallTimeElapsedSec: 20, costUnitsUsed: 3 })

    expect(governor.getUsage(agentId)).toEqual({
      tokensUsed: 17,
      toolCallsUsed: 2,
      wallTimeElapsedSec: 20,
      costUnitsUsed: 3,
    })

    cleanup()
  })

  it('governor cannot be overridden by agent requests', () => {
    const { governor, statePath, cleanup } = createGovernor()
    const agentId = createAgentId('agent-11')

    governor.allocate(agentId, createBudget({ maxTokens: 100 }))
    governor.allocate(agentId, createBudget({ maxTokens: 10_000 }))

    const state = readState(statePath)
    expect(state.agents[agentId]?.budget.maxTokens).toBe(100)
    expect(state.agents[agentId]?.budgetOverrideAttempts).toBe(1)

    cleanup()
  })

  it('trips circuit breaker when cost units exceed max', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('agent-12')

    governor.allocate(agentId, createBudget({ maxCostUnits: 5 }))
    governor.recordUsage(agentId, { costUnitsUsed: 6 })

    const result = governor.checkBudget(agentId)
    expect(result.withinLimits).toBe(false)
    expect(result.exceeded).toContain('cost usage exceeded maximum')

    cleanup()
  })
})

function mockTelemetryMinion(): ITelemetryMinion {
  return {
    recordUsage: vi.fn(),
    detectAnomalies: vi.fn().mockReturnValue([]),
    getAgentBurnRate: vi.fn().mockReturnValue({ tokensPerMinute: 0, trend: 'stable' }),
  }
}

const createGovernorWithTelemetry = (
  telemetry: ITelemetryMinion,
): { governor: BudgetGovernor; statePath: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-governor-telemetry-'))
  const statePath = join(dir, 'state.json')

  return {
    governor: new BudgetGovernor(statePath, telemetry),
    statePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

describe('Phase 2 — Telemetry hooks', () => {
  it('recordUsage forwards to telemetry.recordUsage when injected', () => {
    const telemetry = mockTelemetryMinion()
    const { governor, cleanup } = createGovernorWithTelemetry(telemetry)
    const agentId = createAgentId('telem-agent-1')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { tokensUsed: 10 })

    expect(telemetry.recordUsage).toHaveBeenCalledWith(agentId, { tokensUsed: 10 })

    cleanup()
  })

  it('checkBudget calls telemetry.detectAnomalies and emits BudgetWarning on critical alerts', () => {
    const criticalAlert: TelemetryAlert = {
      type: 'spike',
      agentId: createAgentId('telem-agent-2'),
      message: 'Token spike detected: 60000 tokens',
      severity: 'critical',
    }
    const telemetry = mockTelemetryMinion()
    vi.mocked(telemetry.detectAnomalies).mockReturnValue([criticalAlert])

    const { governor, statePath, cleanup } = createGovernorWithTelemetry(telemetry)
    const agentId = createAgentId('telem-agent-2')

    governor.allocate(agentId, createBudget())
    governor.checkBudget(agentId)

    expect(telemetry.detectAnomalies).toHaveBeenCalledWith(agentId)

    const state = readState(statePath)
    const budgetWarningEvents = state.events.filter((e) => e.eventType === EventType.BudgetWarning)
    expect(budgetWarningEvents).toHaveLength(1)
    expect(budgetWarningEvents[0]?.payload['message']).toBe('Token spike detected: 60000 tokens')

    cleanup()
  })

  it('checkBudget with no anomalies does not emit extra events', () => {
    const telemetry = mockTelemetryMinion()
    // detectAnomalies already returns [] by default from mockTelemetryMinion

    const { governor, statePath, cleanup } = createGovernorWithTelemetry(telemetry)
    const agentId = createAgentId('telem-agent-3')

    governor.allocate(agentId, createBudget())
    governor.checkBudget(agentId)

    expect(telemetry.detectAnomalies).toHaveBeenCalledWith(agentId)

    const state = readState(statePath)
    expect(state.events).toHaveLength(0)

    cleanup()
  })

  it('without telemetry injected, recordUsage and checkBudget work as before', () => {
    const { governor, cleanup } = createGovernor()
    const agentId = createAgentId('telem-agent-4')

    governor.allocate(agentId, createBudget())
    governor.recordUsage(agentId, { tokensUsed: 20 })

    const result = governor.checkBudget(agentId)
    expect(result.withinLimits).toBe(true)
    expect(governor.getUsage(agentId).tokensUsed).toBe(20)

    cleanup()
  })
})
