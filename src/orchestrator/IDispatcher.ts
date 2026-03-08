import type {
  DispatcherState,
  EscalationReason,
  PlanEnvelope,
} from '@shared/types'

export interface IDispatcher {
  accept(envelope: PlanEnvelope): Promise<void>
  getState(planId: string): DispatcherState
  pause(planId: string): void
  resume(planId: string): void
  escalate(planId: string, reason: EscalationReason): Promise<void>
}
