import type { WaitCondition, WorkflowCheckpoint } from '@shared/types'
import type { ICheckpointStore } from '../checkpoints/ICheckpointStore'

interface WaitEntry {
  tenantId: string
  condition: WaitCondition
  registeredAtMs: number
}

export interface WaitConditionSchedulerOptions {
  onReady?: (planId: string, nodeId: string) => Promise<void>
  maxWaitMs?: number
}

export class WaitConditionScheduler {
  private readonly waitsByPlan = new Map<string, Map<string, WaitEntry>>()
  private readonly resolvedExternalIds = new Set<string>()
  private readonly onReady?: (planId: string, nodeId: string) => Promise<void>
  private readonly maxWaitMs: number

  constructor(
    private readonly checkpointStore?: ICheckpointStore,
    options: WaitConditionSchedulerOptions = {},
  ) {
    this.onReady = options.onReady
    this.maxWaitMs = options.maxWaitMs ?? 60_000
  }

  public async register(planId: string, tenantId: string, condition: WaitCondition): Promise<void> {
    const planWaits = this.waitsByPlan.get(planId) ?? new Map<string, WaitEntry>()
    planWaits.set(condition.nodeId, {
      tenantId,
      condition,
      registeredAtMs: Date.now(),
    })
    this.waitsByPlan.set(planId, planWaits)
    await this.persistPlan(planId)
  }

  public getWaitingNodeIds(planId: string): string[] {
    return Array.from(this.waitsByPlan.get(planId)?.keys() ?? [])
  }

  public async resolveExternal(externalCorrelationId: string): Promise<number> {
    this.resolvedExternalIds.add(externalCorrelationId)
    const ready = await this.tick()
    return ready.length
  }

  public async tick(nowIso = new Date().toISOString()): Promise<string[]> {
    const nowMs = new Date(nowIso).getTime()
    const readyRefs: string[] = []

    for (const [planId, waits] of this.waitsByPlan.entries()) {
      for (const [nodeId, entry] of waits.entries()) {
        if (!isConditionReady(entry, this.resolvedExternalIds, nowMs, this.maxWaitMs)) {
          continue
        }

        waits.delete(nodeId)
        readyRefs.push(`${planId}:${nodeId}`)
        if (this.onReady) {
          await this.onReady(planId, nodeId)
        }
      }

      if (waits.size === 0) {
        this.waitsByPlan.delete(planId)
      }
      await this.persistPlan(planId)
    }

    return readyRefs
  }

  private async persistPlan(planId: string): Promise<void> {
    if (!this.checkpointStore) {
      return
    }

    const waits = this.waitsByPlan.get(planId)
    const first = waits?.values().next().value as WaitEntry | undefined
    const now = new Date().toISOString()
    const checkpoint: WorkflowCheckpoint = {
      checkpointId: `wait:${planId}:${Date.now()}`,
      planId,
      tenantId: first?.tenantId ?? 'unknown-tenant',
      status: 'waiting',
      dispatcherState: {
        planId,
        tenantId: first?.tenantId ?? 'unknown-tenant',
        activeNodeIds: [],
        completedNodeIds: [],
        failedNodeIds: [],
        retryCounts: {},
        waitingNodeIds: this.getWaitingNodeIds(planId),
        executionStatus: 'waiting',
      },
      serializedNodeStates: {
        waits: this.getWaitingNodeIds(planId),
      },
      createdAt: now,
      updatedAt: now,
    }

    await this.checkpointStore.save(checkpoint)
  }
}

function isConditionReady(
  entry: WaitEntry,
  resolvedExternalIds: Set<string>,
  nowMs: number,
  maxWaitMs: number,
): boolean {
  const ageMs = nowMs - entry.registeredAtMs
  if (ageMs >= maxWaitMs) {
    return true
  }

  if (entry.condition.resumeAt) {
    const resumeAtMs = new Date(entry.condition.resumeAt).getTime()
    if (Number.isFinite(resumeAtMs) && nowMs >= resumeAtMs) {
      return true
    }
  }

  if (entry.condition.externalCorrelationId && resolvedExternalIds.has(entry.condition.externalCorrelationId)) {
    return true
  }

  if (entry.condition.reason === 'external_event' || entry.condition.reason === 'infra_outage') {
    return false
  }

  return false
}
