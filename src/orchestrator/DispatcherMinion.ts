import type { EvalPipeline } from '@eval/EvalPipeline'
import type { IBudgetGovernor } from '@governor/IBudgetGovernor'
import type { TaskExecutor } from './IJarvis'
import type { IDispatcher } from './IDispatcher'
import type {
  AgentId,
  DispatcherState,
  EscalationReason,
  PlanEnvelope,
  WorkflowCheckpoint,
} from '@shared/types'
import { createAgentId } from '@shared/types'
import { createDispatcherState, markEscalated, setExecutionStatus } from './runtimeState'
import { runDispatcherPlan, serializeNodeStates } from './DispatcherPlanRunner'

type CheckpointStoreLike = {
  save(checkpoint: WorkflowCheckpoint): Promise<void>
}

export interface DispatcherMinionOptions {
  checkpointStore?: CheckpointStoreLike
  maxConcurrentNodes?: number
  escalationSink?: (planId: string, reason: EscalationReason) => Promise<void>
}

export class DispatcherMinion implements IDispatcher {
  private readonly checkpointStore?: CheckpointStoreLike
  private readonly maxConcurrentNodes: number
  private readonly escalationSink?: (planId: string, reason: EscalationReason) => Promise<void>
  private readonly envelopes = new Map<string, PlanEnvelope>()
  private readonly states = new Map<string, DispatcherState>()
  private readonly pausedPlanIds = new Set<string>()
  private readonly runningLoops = new Map<string, Promise<void>>()

  constructor(
    private readonly taskExecutor: TaskExecutor,
    private readonly governor: IBudgetGovernor,
    private readonly evalPipeline: EvalPipeline,
    options: DispatcherMinionOptions = {},
  ) {
    this.checkpointStore = options.checkpointStore
    this.maxConcurrentNodes = Math.max(1, options.maxConcurrentNodes ?? 4)
    this.escalationSink = options.escalationSink
  }

  public async accept(envelope: PlanEnvelope): Promise<void> {
    if (this.envelopes.has(envelope.planId)) {
      throw new Error(`Plan already accepted: ${envelope.planId}`)
    }

    this.envelopes.set(envelope.planId, envelope)
    this.governor.allocate(this.toGovernorAgentId(envelope.planId), envelope.budgetEnvelope)
    await this.persistState(envelope, createDispatcherState(envelope))
    void this.startRunLoop(envelope.planId)
  }

  public getState(planId: string): DispatcherState {
    const state = this.requireState(planId)
    return {
      ...state,
      activeNodeIds: [...state.activeNodeIds],
      completedNodeIds: [...state.completedNodeIds],
      failedNodeIds: [...state.failedNodeIds],
      waitingNodeIds: [...state.waitingNodeIds],
      retryCounts: { ...state.retryCounts },
    }
  }

  public pause(planId: string): void {
    const envelope = this.requireEnvelope(planId)
    this.pausedPlanIds.add(planId)
    void this.persistState(envelope, setExecutionStatus(this.requireState(planId), 'waiting'))
  }

  public resume(planId: string): void {
    this.requireEnvelope(planId)
    this.pausedPlanIds.delete(planId)
    void this.startRunLoop(planId)
  }

  public async escalate(planId: string, reason: EscalationReason): Promise<void> {
    const envelope = this.requireEnvelope(planId)
    await this.persistState(envelope, markEscalated(this.requireState(planId), reason))
    if (this.escalationSink) {
      await this.escalationSink(planId, reason)
    }
  }

  private async startRunLoop(planId: string): Promise<void> {
    if (this.runningLoops.has(planId)) {
      return
    }

    const runPromise = runDispatcherPlan({
      taskExecutor: this.taskExecutor,
      governor: this.governor,
      envelope: this.requireEnvelope(planId),
      maxConcurrentNodes: this.maxConcurrentNodes,
      getState: () => this.requireState(planId),
      persistState: (state) => this.persistState(this.requireEnvelope(planId), state),
      escalate: (reason) => this.escalate(planId, reason),
      isPaused: () => this.pausedPlanIds.has(planId),
      toGovernorAgentId: (id) => this.toGovernorAgentId(id),
    }).finally(() => this.runningLoops.delete(planId))

    this.runningLoops.set(planId, runPromise)
    void this.evalPipeline
    await runPromise
  }

  private async persistState(envelope: PlanEnvelope, state: DispatcherState): Promise<void> {
    this.states.set(envelope.planId, state)
    if (!this.checkpointStore) {
      return
    }

    const now = new Date().toISOString()
    const checkpoint: WorkflowCheckpoint = {
      checkpointId: `${envelope.planId}:${Date.now()}`,
      planId: envelope.planId,
      tenantId: envelope.tenantId,
      status: state.executionStatus,
      dispatcherState: state,
      serializedNodeStates: serializeNodeStates(envelope, state),
      createdAt: now,
      updatedAt: now,
    }
    await this.checkpointStore.save(checkpoint)
  }

  private requireEnvelope(planId: string): PlanEnvelope {
    const envelope = this.envelopes.get(planId)
    if (!envelope) {
      throw new Error(`Unknown plan envelope: ${planId}`)
    }
    return envelope
  }

  private requireState(planId: string): DispatcherState {
    const state = this.states.get(planId)
    if (!state) {
      throw new Error(`Unknown plan state: ${planId}`)
    }
    return state
  }

  private toGovernorAgentId(planId: string): AgentId {
    return createAgentId(`dispatcher:${planId}`)
  }
}
