import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebhookManagerOps } from '@primitives/WebhookManager/operations'
import { webhookSubscriptionTable } from '@primitives/WebhookManager/schema'

describe('WebhookManagerOps', () => {
  let dbMock: {
    insert: ReturnType<typeof vi.fn>
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    execute: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    dbMock = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn(),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    }
  })

  it('registers webhook and returns id', async () => {
    dbMock.returning.mockResolvedValueOnce([{ id: 'hook-1' }])
    const ops = new WebhookManagerOps(
      dbMock as unknown as ConstructorParameters<typeof WebhookManagerOps>[0],
      vi.fn(),
    )

    const result = await ops.registerWebhook('biz-1', 'task.completed', 'https://hook.test', 'secret')

    expect(dbMock.insert).toHaveBeenCalledWith(webhookSubscriptionTable)
    expect(result).toEqual({ id: 'hook-1' })
  })

  it('lists active webhooks for a business', async () => {
    dbMock.execute.mockResolvedValueOnce([{ id: 'hook-1' }, { id: 'hook-2' }])
    const ops = new WebhookManagerOps(
      dbMock as unknown as ConstructorParameters<typeof WebhookManagerOps>[0],
      vi.fn(),
    )

    const result = await ops.listWebhooks('biz-2')

    expect(dbMock.select).toHaveBeenCalled()
    expect(result).toHaveLength(2)
  })

  it('deactivates webhook subscriptions', async () => {
    dbMock.returning.mockResolvedValueOnce([{ id: 'hook-3' }])
    const ops = new WebhookManagerOps(
      dbMock as unknown as ConstructorParameters<typeof WebhookManagerOps>[0],
      vi.fn(),
    )

    const result = await ops.deactivateWebhook('hook-3')

    expect(dbMock.update).toHaveBeenCalledWith(webhookSubscriptionTable)
    expect(result).toBe(true)
  })

  it('dispatches payloads and reports delivered/failed counts', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })

    dbMock.execute.mockResolvedValueOnce([
      { targetUrl: 'https://hook.one', signingSecret: 's1' },
      { targetUrl: 'https://hook.two', signingSecret: 's2' },
    ])

    const ops = new WebhookManagerOps(
      dbMock as unknown as ConstructorParameters<typeof WebhookManagerOps>[0],
      fetcher,
    )

    const result = await ops.dispatchEvent('biz-3', 'event.x', { ok: true })

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ delivered: 1, failed: 1 })
  })

  it('counts malformed webhook records as failed dispatches', async () => {
    dbMock.execute.mockResolvedValueOnce([{ targetUrl: 123, signingSecret: null }])

    const ops = new WebhookManagerOps(
      dbMock as unknown as ConstructorParameters<typeof WebhookManagerOps>[0],
      vi.fn(),
    )

    const result = await ops.dispatchEvent('biz-4', 'event.y', { message: 'x' })

    expect(result).toEqual({ delivered: 0, failed: 1 })
  })

  it('returns false when deactivating missing webhook', async () => {
    dbMock.returning.mockResolvedValueOnce([])

    const ops = new WebhookManagerOps(
      dbMock as unknown as ConstructorParameters<typeof WebhookManagerOps>[0],
      vi.fn(),
    )

    const result = await ops.deactivateWebhook('missing')
    expect(result).toBe(false)
  })
})
