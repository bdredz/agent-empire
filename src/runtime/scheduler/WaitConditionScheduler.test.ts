import { describe, expect, it, vi } from 'vitest'
import type { ICheckpointStore } from '../checkpoints/ICheckpointStore'
import type { WorkflowCheckpoint } from '@shared/types'
import { WaitConditionScheduler } from './WaitConditionScheduler'

function makeCheckpointStore(): ICheckpointStore {
  return {
    save: vi.fn(async (_checkpoint: WorkflowCheckpoint) => {}),
    load: vi.fn(async () => null),
    list: vi.fn(async () => []),
    delete: vi.fn(async () => {}),
  }
}

describe('WaitConditionScheduler', () => {
  it('resolves time-delay waits when resumeAt is reached', async () => {
    const scheduler = new WaitConditionScheduler()
    await scheduler.register('plan-1', 'tenant-1', {
      nodeId: 'node-a',
      reason: 'time_delay',
      resumeAt: '2026-03-08T10:00:00.000Z',
    })

    const ready = await scheduler.tick('2026-03-08T10:00:01.000Z')

    expect(ready).toEqual(['plan-1:node-a'])
    expect(scheduler.getWaitingNodeIds('plan-1')).toEqual([])
  })

  it('resolves external-event waits by correlation id', async () => {
    const scheduler = new WaitConditionScheduler()
    await scheduler.register('plan-1', 'tenant-1', {
      nodeId: 'node-a',
      reason: 'external_event',
      externalCorrelationId: 'event-123',
    })

    const resolvedCount = await scheduler.resolveExternal('event-123')

    expect(resolvedCount).toBe(1)
    expect(scheduler.getWaitingNodeIds('plan-1')).toEqual([])
  })

  it('resolves rate-limit waits using resumeAt', async () => {
    const scheduler = new WaitConditionScheduler()
    await scheduler.register('plan-2', 'tenant-2', {
      nodeId: 'node-b',
      reason: 'rate_limit',
      resumeAt: '2026-03-08T11:00:00.000Z',
    })

    const before = await scheduler.tick('2026-03-08T10:59:59.000Z')
    const after = await scheduler.tick('2026-03-08T11:00:01.000Z')

    expect(before).toEqual([])
    expect(after).toEqual(['plan-2:node-b'])
  })

  it('resolves infra-outage waits via external signal', async () => {
    const scheduler = new WaitConditionScheduler()
    await scheduler.register('plan-3', 'tenant-3', {
      nodeId: 'node-c',
      reason: 'infra_outage',
      externalCorrelationId: 'infra-restored',
    })

    const ready = await scheduler.resolveExternal('infra-restored')

    expect(ready).toBe(1)
  })

  it('expires stale waits after max wait duration', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T12:00:00.000Z'))

    const scheduler = new WaitConditionScheduler(undefined, { maxWaitMs: 1000 })
    await scheduler.register('plan-4', 'tenant-4', {
      nodeId: 'node-d',
      reason: 'external_event',
      externalCorrelationId: 'never-arrives',
    })

    vi.setSystemTime(new Date('2026-03-08T12:00:02.000Z'))
    const ready = await scheduler.tick('2026-03-08T12:00:02.000Z')

    expect(ready).toEqual(['plan-4:node-d'])
    vi.useRealTimers()
  })

  it('handles concurrent waits and persists checkpoints', async () => {
    const store = makeCheckpointStore()
    const onReady = vi.fn(async () => {})
    const scheduler = new WaitConditionScheduler(store, { onReady })

    await scheduler.register('plan-5', 'tenant-5', {
      nodeId: 'node-1',
      reason: 'time_delay',
      resumeAt: '2026-03-08T13:00:00.000Z',
    })
    await scheduler.register('plan-5', 'tenant-5', {
      nodeId: 'node-2',
      reason: 'time_delay',
      resumeAt: '2026-03-08T13:00:00.000Z',
    })

    const ready = await scheduler.tick('2026-03-08T13:00:01.000Z')

    expect(new Set(ready)).toEqual(new Set(['plan-5:node-1', 'plan-5:node-2']))
    expect(onReady).toHaveBeenCalledTimes(2)
    expect(store.save).toHaveBeenCalled()
  })
})
