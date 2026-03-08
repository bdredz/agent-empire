import { describe, expect, it } from 'vitest'
import type { WorkflowCheckpoint } from '@shared/types'
import { PostgresCheckpointStore, type PostgresCheckpointDb } from './PostgresCheckpointStore'

class InMemoryPostgresDb implements PostgresCheckpointDb {
  private readonly records = new Map<string, { checkpointId: string; planId: string; tenantId: string; payload: string }>()

  async upsert(record: { checkpointId: string; planId: string; tenantId: string; payload: string }): Promise<void> {
    this.records.set(record.checkpointId, record)
  }

  async findByPlanId(planId: string): Promise<{ checkpointId: string; planId: string; tenantId: string; payload: string } | null> {
    const matching = Array.from(this.records.values()).filter((record) => record.planId === planId)
    if (matching.length === 0) {
      return null
    }
    matching.sort((a, b) => b.checkpointId.localeCompare(a.checkpointId))
    return matching[0] ?? null
  }

  async listByTenant(tenantId: string): Promise<{ checkpointId: string; planId: string; tenantId: string; payload: string }[]> {
    return Array.from(this.records.values()).filter((record) => record.tenantId === tenantId)
  }

  async deleteByCheckpointId(checkpointId: string): Promise<void> {
    this.records.delete(checkpointId)
  }
}

function makeCheckpoint(overrides: Partial<WorkflowCheckpoint> = {}): WorkflowCheckpoint {
  return {
    checkpointId: 'cp-1',
    planId: 'plan-1',
    tenantId: 'tenant-1',
    status: 'running',
    dispatcherState: {
      planId: 'plan-1',
      tenantId: 'tenant-1',
      activeNodeIds: ['node-a'],
      completedNodeIds: [],
      failedNodeIds: [],
      retryCounts: {},
      waitingNodeIds: [],
      executionStatus: 'running',
    },
    serializedNodeStates: { 'node-a': 'running' },
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('PostgresCheckpointStore', () => {
  it('saves and loads checkpoints', async () => {
    const store = new PostgresCheckpointStore(new InMemoryPostgresDb())
    const checkpoint = makeCheckpoint()

    await store.save(checkpoint)
    const loaded = await store.load('plan-1')

    expect(loaded).toEqual(checkpoint)
  })

  it('overwrites by newer checkpoint id for same plan', async () => {
    const store = new PostgresCheckpointStore(new InMemoryPostgresDb())
    await store.save(makeCheckpoint({ checkpointId: 'cp-1' }))
    await store.save(makeCheckpoint({ checkpointId: 'cp-2', status: 'waiting' }))

    const loaded = await store.load('plan-1')

    expect(loaded?.checkpointId).toBe('cp-2')
    expect(loaded?.status).toBe('waiting')
  })

  it('returns null for missing checkpoint', async () => {
    const store = new PostgresCheckpointStore(new InMemoryPostgresDb())

    expect(await store.load('missing-plan')).toBeNull()
  })

  it('lists checkpoints by tenant', async () => {
    const store = new PostgresCheckpointStore(new InMemoryPostgresDb())
    await store.save(makeCheckpoint({ checkpointId: 'cp-a', tenantId: 'tenant-1', planId: 'plan-a' }))
    await store.save(makeCheckpoint({ checkpointId: 'cp-b', tenantId: 'tenant-2', planId: 'plan-b' }))

    const list = await store.list('tenant-1')

    expect(list).toHaveLength(1)
    expect(list[0]?.checkpointId).toBe('cp-a')
  })

  it('deletes checkpoints by id', async () => {
    const store = new PostgresCheckpointStore(new InMemoryPostgresDb())
    await store.save(makeCheckpoint({ checkpointId: 'cp-delete' }))

    await store.delete('cp-delete')

    const loaded = await store.load('plan-1')
    expect(loaded).toBeNull()
  })

  it('maintains tenant isolation in lists', async () => {
    const store = new PostgresCheckpointStore(new InMemoryPostgresDb())
    await store.save(makeCheckpoint({ checkpointId: 'cp-1', tenantId: 'tenant-a' }))
    await store.save(makeCheckpoint({ checkpointId: 'cp-2', tenantId: 'tenant-b', planId: 'plan-2' }))

    expect((await store.list('tenant-a')).map((item) => item.tenantId)).toEqual(['tenant-a'])
  })

  it('supports concurrent writes', async () => {
    const store = new PostgresCheckpointStore(new InMemoryPostgresDb())
    await Promise.all([
      store.save(makeCheckpoint({ checkpointId: 'cp-1' })),
      store.save(makeCheckpoint({ checkpointId: 'cp-2' })),
      store.save(makeCheckpoint({ checkpointId: 'cp-3' })),
    ])

    const loaded = await store.load('plan-1')
    expect(loaded?.checkpointId).toBe('cp-3')
  })

  it('preserves serialized node state payload', async () => {
    const store = new PostgresCheckpointStore(new InMemoryPostgresDb())
    const checkpoint = makeCheckpoint({ serializedNodeStates: { 'node-x': 'waiting', retries: 2 } })

    await store.save(checkpoint)
    const loaded = await store.load('plan-1')

    expect(loaded?.serializedNodeStates).toEqual({ 'node-x': 'waiting', retries: 2 })
  })
})
