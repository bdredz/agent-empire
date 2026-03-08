import { describe, expect, it } from 'vitest'
import type { WorkflowCheckpoint } from '@shared/types'
import { RedisCheckpointStore } from './RedisCheckpointStore'

class FakeRedis {
  private readonly data = new Map<string, { value: string; expiresAt: number }>()
  private nowMs = 0

  async set(key: string, value: string, _mode: 'PX', ttlMs: number): Promise<'OK'> {
    this.data.set(key, { value, expiresAt: this.nowMs + ttlMs })
    return 'OK'
  }

  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key)
    if (!entry) {
      return null
    }
    if (entry.expiresAt <= this.nowMs) {
      this.data.delete(key)
      return null
    }
    return entry.value
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0
    for (const key of keys) {
      if (this.data.delete(key)) {
        removed += 1
      }
    }
    return removed
  }

  async keys(pattern: string): Promise<string[]> {
    const matcher = new RegExp(`^${pattern.replaceAll('*', '.*')}$`)
    return Array.from(this.data.keys()).filter((key) => matcher.test(key))
  }

  advance(ms: number): void {
    this.nowMs += ms
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
      activeNodeIds: [],
      completedNodeIds: [],
      failedNodeIds: [],
      retryCounts: {},
      waitingNodeIds: [],
      executionStatus: 'running',
    },
    serializedNodeStates: { node: 'running' },
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('RedisCheckpointStore', () => {
  it('saves and loads checkpoints', async () => {
    const redis = new FakeRedis()
    const store = new RedisCheckpointStore(redis)
    const checkpoint = makeCheckpoint()

    await store.save(checkpoint)
    const loaded = await store.load('plan-1')

    expect(loaded).toEqual(checkpoint)
  })

  it('expires checkpoints by TTL', async () => {
    const redis = new FakeRedis()
    const store = new RedisCheckpointStore(redis, { ttlMs: 100 })
    await store.save(makeCheckpoint())

    redis.advance(101)
    const loaded = await store.load('plan-1')

    expect(loaded).toBeNull()
  })

  it('deletes checkpoints by id', async () => {
    const redis = new FakeRedis()
    const store = new RedisCheckpointStore(redis)
    await store.save(makeCheckpoint({ checkpointId: 'cp-delete' }))

    await store.delete('cp-delete')
    const loaded = await store.load('plan-1')

    expect(loaded).toBeNull()
  })

  it('returns null for unknown plan', async () => {
    const redis = new FakeRedis()
    const store = new RedisCheckpointStore(redis)

    expect(await store.load('missing-plan')).toBeNull()
  })

  it('round-trips serialized payload accurately', async () => {
    const redis = new FakeRedis()
    const store = new RedisCheckpointStore(redis)
    const checkpoint = makeCheckpoint({ serializedNodeStates: { complex: { nested: true }, retries: [1, 2] } })

    await store.save(checkpoint)
    const loaded = await store.load('plan-1')

    expect(loaded?.serializedNodeStates).toEqual({ complex: { nested: true }, retries: [1, 2] })
  })

  it('lists checkpoints scoped by tenant', async () => {
    const redis = new FakeRedis()
    const store = new RedisCheckpointStore(redis)
    await store.save(makeCheckpoint({ checkpointId: 'cp-a', tenantId: 'tenant-a', planId: 'plan-a' }))
    await store.save(makeCheckpoint({ checkpointId: 'cp-b', tenantId: 'tenant-b', planId: 'plan-b' }))

    const list = await store.list('tenant-a')

    expect(list).toHaveLength(1)
    expect(list[0]?.checkpointId).toBe('cp-a')
  })
})
