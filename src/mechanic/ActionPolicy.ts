import type { MechanicAction } from '@shared/types'

const ALLOWED_ACTIONS: ReadonlySet<MechanicAction> = new Set([
  'start_container',
  'stop_container',
  'create_database',
  'create_repo',
  'attach_network',
  'generate_manifest',
  'deploy_gateway',
])

export interface ActionPolicyDecision {
  readonly allowed: boolean
  readonly reason?: string
}

export class ActionPolicy {
  public evaluate(action: string): ActionPolicyDecision {
    if (ALLOWED_ACTIONS.has(action as MechanicAction)) {
      return { allowed: true }
    }

    return {
      allowed: false,
      reason: `Action is not whitelisted: ${action}`,
    }
  }
}
