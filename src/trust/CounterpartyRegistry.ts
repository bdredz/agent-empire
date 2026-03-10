import { nanoid } from 'nanoid'
import {
  CounterpartyId,
  CounterpartyRecord,
  createCounterpartyId,
} from '@shared/types'

export type CounterpartyRiskEvent =
  | 'task_completed'
  | 'task_failed'
  | 'refund_issued'
  | 'dispute_filed'
  | 'policy_violation'

interface StoredCounterparty {
  tenantId: string
  record: CounterpartyRecord
}

const ALLOWED_TRANSITIONS: Record<
  CounterpartyRecord['trustStatus'],
  CounterpartyRecord['trustStatus'][]
> = {
  unknown: ['trusted', 'watch'],
  trusted: ['watch'],
  watch: ['blocked'],
  blocked: [],
}

export class CounterpartyRegistry {
  private readonly records = new Map<string, StoredCounterparty>()

  public async add(
    tenantId: string,
    input: Omit<CounterpartyRecord, 'counterpartyId' | 'riskScore' | 'createdAt' | 'updatedAt'>,
  ): Promise<CounterpartyRecord> {
    const now = new Date().toISOString()
    const record: CounterpartyRecord = {
      counterpartyId: createCounterpartyId(`counterparty_${nanoid()}`),
      displayName: input.displayName,
      counterpartyType: input.counterpartyType,
      trustStatus: input.trustStatus,
      riskScore: 50,
      tags: [...input.tags],
      createdAt: now,
      updatedAt: now,
    }

    this.records.set(this.key(tenantId, record.counterpartyId), {
      tenantId,
      record,
    })

    return cloneCounterparty(record)
  }

  public async get(
    tenantId: string,
    counterpartyId: CounterpartyId,
  ): Promise<CounterpartyRecord | null> {
    const stored = this.records.get(this.key(tenantId, counterpartyId))
    return stored ? cloneCounterparty(stored.record) : null
  }

  public async updateTrustStatus(
    tenantId: string,
    counterpartyId: CounterpartyId,
    nextStatus: CounterpartyRecord['trustStatus'],
  ): Promise<CounterpartyRecord> {
    const stored = this.requireStored(tenantId, counterpartyId)
    const current = stored.record.trustStatus

    if (current !== nextStatus) {
      const allowed = ALLOWED_TRANSITIONS[current]
      if (!allowed.includes(nextStatus)) {
        throw new Error(`Invalid trust status transition: ${current} -> ${nextStatus}`)
      }

      stored.record.trustStatus = nextStatus
      stored.record.updatedAt = new Date().toISOString()
    }

    return cloneCounterparty(stored.record)
  }

  public async recordRiskEvent(
    tenantId: string,
    counterpartyId: CounterpartyId,
    event: CounterpartyRiskEvent,
  ): Promise<CounterpartyRecord> {
    const stored = this.requireStored(tenantId, counterpartyId)
    const delta = eventRiskDelta(event)

    stored.record.riskScore = clampRisk(stored.record.riskScore + delta)
    stored.record.updatedAt = new Date().toISOString()

    return cloneCounterparty(stored.record)
  }

  public async listByType(
    tenantId: string,
    counterpartyType: CounterpartyRecord['counterpartyType'],
  ): Promise<CounterpartyRecord[]> {
    const records = await this.listByTenant(tenantId)
    return records.filter((record) => record.counterpartyType === counterpartyType)
  }

  public async listByTag(tenantId: string, tag: string): Promise<CounterpartyRecord[]> {
    const records = await this.listByTenant(tenantId)
    return records.filter((record) => record.tags.includes(tag))
  }

  public async listByTenant(tenantId: string): Promise<CounterpartyRecord[]> {
    return Array.from(this.records.values())
      .filter((stored) => stored.tenantId === tenantId)
      .map((stored) => cloneCounterparty(stored.record))
  }

  private key(tenantId: string, counterpartyId: CounterpartyId): string {
    return `${tenantId}:${counterpartyId}`
  }

  private requireStored(tenantId: string, counterpartyId: CounterpartyId): StoredCounterparty {
    const stored = this.records.get(this.key(tenantId, counterpartyId))
    if (!stored) {
      throw new Error(`Counterparty not found: ${counterpartyId}`)
    }

    return stored
  }
}

function eventRiskDelta(event: CounterpartyRiskEvent): number {
  switch (event) {
    case 'task_completed':
      return 5
    case 'task_failed':
      return -5
    case 'refund_issued':
      return -8
    case 'dispute_filed':
      return -10
    case 'policy_violation':
      return -15
  }
}

function clampRisk(score: number): number {
  return Math.max(0, Math.min(100, score))
}

function cloneCounterparty(record: CounterpartyRecord): CounterpartyRecord {
  return {
    ...record,
    tags: [...record.tags],
  }
}
