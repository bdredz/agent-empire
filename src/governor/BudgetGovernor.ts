import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import pino from 'pino'
import {
  AgentId,
  AgentStatus,
  Budget,
  BudgetCheckResult,
  BudgetGovernorAgentState,
  BudgetGovernorState,
  BudgetThresholdConfig,
  BudgetUsage,
  EventType,
  SystemEvent,
} from '@shared/types'
import { IBudgetGovernor } from '@governor/IBudgetGovernor'
import { ITelemetryMinion } from '../minions/TelemetryMinion'

const DEFAULT_WARNING_RATIO = 0.75
const DEFAULT_TRIP_RATIO = 0.9
const DEFAULT_STATE_FILE = '.data/budget-governor-state.json'

export class BudgetGovernor implements IBudgetGovernor {
  private readonly logger = pino({ name: 'budget-governor' })
  private readonly stateFilePath: string
  private readonly thresholds: BudgetThresholdConfig

  constructor(stateFilePath?: string, private readonly telemetry?: ITelemetryMinion) {
    this.stateFilePath = stateFilePath ?? process.env.BUDGET_GOVERNOR_STATE_FILE ?? DEFAULT_STATE_FILE
    this.thresholds = {
      warningRatio: this.readRatioFromEnv('BUDGET_WARNING_RATIO', DEFAULT_WARNING_RATIO),
      tripRatio: this.readRatioFromEnv('BUDGET_TRIP_RATIO', DEFAULT_TRIP_RATIO),
    }
  }

  public allocate(agentId: AgentId, budget: Budget): void {
    const state = this.readState()
    const agentKey = this.toAgentKey(agentId)
    const existing = state.agents[agentKey]

    if (existing) {
      state.agents[agentKey] = {
        ...existing,
        budgetOverrideAttempts: existing.budgetOverrideAttempts + 1,
      }
      this.writeState(state)
      return
    }

    state.agents[agentKey] = {
      budget,
      usage: this.createEmptyUsage(),
      status: AgentStatus.Ready,
      budgetOverrideAttempts: 0,
    }
    this.writeState(state)
  }

  public recordUsage(agentId: AgentId, usage: Partial<BudgetUsage>): void {
    const state = this.readState()
    const agentState = this.requireAgentState(state, agentId)

    state.agents[this.toAgentKey(agentId)] = {
      ...agentState,
      usage: {
        tokensUsed: agentState.usage.tokensUsed + (usage.tokensUsed ?? 0),
        toolCallsUsed: agentState.usage.toolCallsUsed + (usage.toolCallsUsed ?? 0),
        wallTimeElapsedSec: agentState.usage.wallTimeElapsedSec + (usage.wallTimeElapsedSec ?? 0),
        costUnitsUsed: agentState.usage.costUnitsUsed + (usage.costUnitsUsed ?? 0),
      },
    }

    this.writeState(state)

    // Phase 2: Forward usage to telemetry minion
    if (this.telemetry) {
      this.telemetry.recordUsage(agentId, usage)
    }

    const checkResult = this.checkBudget(agentId)
    if (!checkResult.withinLimits) {
      this.tripCircuitBreaker(agentId, checkResult.exceeded.join('; '))
    }
  }

  public checkBudget(agentId: AgentId): BudgetCheckResult {
    const state = this.readState()
    const agentState = this.requireAgentState(state, agentId)
    const warnings: string[] = []
    const exceeded: string[] = []

    this.evaluateRatio(agentState.usage.tokensUsed, agentState.budget.maxTokens, 'tokens', warnings, exceeded)
    this.evaluateRatio(agentState.usage.toolCallsUsed, agentState.budget.maxToolCalls, 'tool calls', warnings, exceeded)
    this.evaluateRatio(agentState.usage.wallTimeElapsedSec, agentState.budget.maxWallTimeSec, 'wall time', warnings, exceeded)

    if (agentState.budget.maxCostUnits !== undefined) {
      const warningMax = agentState.budget.maxCostUnits * this.thresholds.warningRatio
      if (agentState.usage.costUnitsUsed >= warningMax) {
        warnings.push('cost usage exceeded warning threshold')
      }
      if (agentState.usage.costUnitsUsed > agentState.budget.maxCostUnits) {
        exceeded.push('cost usage exceeded maximum')
      }
    }

    if (agentState.status === AgentStatus.Paused && exceeded.length === 0) {
      exceeded.push(agentState.circuitBreakerReason ?? 'circuit breaker tripped')
    }

    // Phase 2: Check for anomalies via telemetry
    if (this.telemetry) {
      const alerts = this.telemetry.detectAnomalies(agentId)
      for (const alert of alerts) {
        if (alert.severity === 'critical') {
          this.emitEvent(EventType.BudgetWarning, agentId, alert.message)
        }
      }
    }

    return {
      withinLimits: exceeded.length === 0,
      warnings,
      exceeded,
    }
  }

  public tripCircuitBreaker(agentId: AgentId, reason: string): void {
    const state = this.readState()
    const agentState = this.requireAgentState(state, agentId)
    const trippedAt = new Date().toISOString()

    state.agents[this.toAgentKey(agentId)] = {
      ...agentState,
      status: AgentStatus.Paused,
      circuitBreakerReason: reason,
      circuitBreakerTrippedAt: trippedAt,
    }

    const event: SystemEvent = {
      eventId: `${this.toAgentKey(agentId)}:${trippedAt}`,
      eventType: EventType.CircuitBreakerTripped,
      timestamp: trippedAt,
      agentId,
      payload: {
        reason,
        usage: state.agents[this.toAgentKey(agentId)]?.usage ?? this.createEmptyUsage(),
        budget: state.agents[this.toAgentKey(agentId)]?.budget,
      },
      severity: 'critical',
    }

    state.events = [...state.events, event]
    this.writeState(state)

    this.logger.error({ agentId, reason, usage: event.payload.usage }, 'Circuit breaker tripped')
  }

  public getUsage(agentId: AgentId): BudgetUsage {
    const state = this.readState()
    return this.requireAgentState(state, agentId).usage
  }

  private emitEvent(eventType: EventType, agentId: AgentId, message: string): void {
    const state = this.readState()
    const timestamp = new Date().toISOString()
    const event: SystemEvent = {
      eventId: `${this.toAgentKey(agentId)}:${eventType}:${timestamp}`,
      eventType,
      timestamp,
      agentId,
      payload: { message },
      severity: 'warning',
    }
    state.events = [...state.events, event]
    this.writeState(state)
  }

  private readRatioFromEnv(envKey: string, fallback: number): number {
    const envValue = process.env[envKey]
    const parsed = envValue ? Number(envValue) : NaN
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      return fallback
    }
    return parsed
  }

  private evaluateRatio(current: number, max: number, metric: string, warnings: string[], exceeded: string[]): void {
    if (current >= max * this.thresholds.warningRatio) {
      warnings.push(`${metric} usage exceeded warning threshold`)
    }
    if (current >= max * this.thresholds.tripRatio) {
      exceeded.push(`${metric} usage exceeded trip threshold`)
    }
  }

  private requireAgentState(state: BudgetGovernorState, agentId: AgentId): BudgetGovernorAgentState {
    const agentState = state.agents[this.toAgentKey(agentId)]
    if (!agentState) {
      throw new Error(`Unknown agent budget allocation: ${this.toAgentKey(agentId)}`)
    }
    return agentState
  }

  private readState(): BudgetGovernorState {
    if (!existsSync(this.stateFilePath)) {
      return { agents: {}, events: [] }
    }

    const rawState = readFileSync(this.stateFilePath, 'utf-8')
    return JSON.parse(rawState) as BudgetGovernorState
  }

  private writeState(state: BudgetGovernorState): void {
    const directory = dirname(this.stateFilePath)
    mkdirSync(directory, { recursive: true })
    writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8')
  }

  private createEmptyUsage(): BudgetUsage {
    return {
      tokensUsed: 0,
      toolCallsUsed: 0,
      wallTimeElapsedSec: 0,
      costUnitsUsed: 0,
    }
  }

  private toAgentKey(agentId: AgentId): string {
    return agentId as string
  }
}
