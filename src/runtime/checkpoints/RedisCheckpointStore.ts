import type { WorkflowCheckpoint } from '@shared/types'
import type { ICheckpointStore } from './ICheckpointStore'

interface RedisLike {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<'OK'>
  get(key: string): Promise<string | null>
  del(...keys: string[]): Promise<number>
  keys(pattern: string): Promise<string[]>
}

export interface RedisCheckpointStoreOptions {
  ttlMs?: number
}

export class RedisCheckpointStore implements ICheckpointStore {
  private readonly ttlMs: number

  constructor(
    private readonly redis: RedisLike,
    options: RedisCheckpointStoreOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 3_600_000
  }

  public async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    const checkpointKey = this.getCheckpointKey(checkpoint.planId, checkpoint.checkpointId)
    const latestKey = this.getLatestKey(checkpoint.planId)
    const payload = JSON.stringify(checkpoint)

    await this.redis.set(checkpointKey, payload, 'PX', this.ttlMs)
    await this.redis.set(latestKey, checkpointKey, 'PX', this.ttlMs)
  }

  public async load(planId: string): Promise<WorkflowCheckpoint | null> {
    const latestPointer = await this.redis.get(this.getLatestKey(planId))
    if (!latestPointer) {
      return null
    }

    const payload = await this.redis.get(latestPointer)
    if (!payload) {
      return null
    }
    return JSON.parse(payload) as WorkflowCheckpoint
  }

  public async list(tenantId: string): Promise<WorkflowCheckpoint[]> {
    const keys = await this.redis.keys('checkpoint:*:*')
    const results: WorkflowCheckpoint[] = []

    for (const key of keys) {
      if (key.startsWith('checkpoint:latest:')) {
        continue
      }
      const payload = await this.redis.get(key)
      if (!payload) {
        continue
      }
      const checkpoint = JSON.parse(payload) as WorkflowCheckpoint
      if (checkpoint.tenantId === tenantId) {
        results.push(checkpoint)
      }
    }

    return results
  }

  public async delete(checkpointId: string): Promise<void> {
    const keys = await this.redis.keys(`checkpoint:*:${checkpointId}`)
    if (keys.length === 0) {
      return
    }
    await this.redis.del(...keys)
  }

  private getCheckpointKey(planId: string, checkpointId: string): string {
    return `checkpoint:${planId}:${checkpointId}`
  }

  private getLatestKey(planId: string): string {
    return `checkpoint:latest:${planId}`
  }
}
