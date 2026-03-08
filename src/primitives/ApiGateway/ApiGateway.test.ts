import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiGatewayOps } from '@primitives/ApiGateway/operations'
import { apiGatewayRequestTable } from '@primitives/ApiGateway/schema'

describe('ApiGatewayOps', () => {
  let dbMock: {
    insert: ReturnType<typeof vi.fn>
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    dbMock = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'req-1' }]),
    }
  })

  it('proxies request and records response', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => '{"ok":true}',
      headers: {
        forEach: (cb: (value: string, key: string) => void) => cb('application/json', 'content-type'),
      },
    })

    const ops = new ApiGatewayOps(
      dbMock as unknown as ConstructorParameters<typeof ApiGatewayOps>[0],
      fetcher,
      () => 1000,
    )

    const result = await ops.proxyRequest({
      businessId: 'biz-1',
      targetUrl: 'https://api.example.com/data',
      method: 'GET',
    })

    expect(fetcher).toHaveBeenCalledOnce()
    expect(dbMock.insert).toHaveBeenCalledWith(apiGatewayRequestTable)
    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toBe('application/json')
  })

  it('tracks usage count per business', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => 'ok',
      headers: { forEach: () => {} },
    })

    const ops = new ApiGatewayOps(
      dbMock as unknown as ConstructorParameters<typeof ApiGatewayOps>[0],
      fetcher,
      () => 1000,
    )

    await ops.proxyRequest({ businessId: 'biz-2', targetUrl: 'https://a.com', method: 'GET' })
    await ops.proxyRequest({ businessId: 'biz-2', targetUrl: 'https://a.com', method: 'GET' })

    expect(ops.getUsage('biz-2').count).toBe(2)
  })

  it('rejects when rate limit is exceeded', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => 'ok',
      headers: { forEach: () => {} },
    })

    const ops = new ApiGatewayOps(
      dbMock as unknown as ConstructorParameters<typeof ApiGatewayOps>[0],
      fetcher,
      () => 2000,
    )

    await ops.proxyRequest({
      businessId: 'biz-3',
      targetUrl: 'https://a.com',
      method: 'GET',
      rateLimitPerMin: 1,
    })

    await expect(
      ops.proxyRequest({
        businessId: 'biz-3',
        targetUrl: 'https://a.com',
        method: 'GET',
        rateLimitPerMin: 1,
      }),
    ).rejects.toThrow('Rate limit exceeded')
  })

  it('resets usage after a minute window', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => 'ok',
      headers: { forEach: () => {} },
    })

    let now = 1_000
    const ops = new ApiGatewayOps(
      dbMock as unknown as ConstructorParameters<typeof ApiGatewayOps>[0],
      fetcher,
      () => now,
    )

    await ops.proxyRequest({ businessId: 'biz-4', targetUrl: 'https://a.com', method: 'GET', rateLimitPerMin: 1 })
    now = 70_000
    await ops.proxyRequest({ businessId: 'biz-4', targetUrl: 'https://a.com', method: 'GET', rateLimitPerMin: 1 })

    expect(ops.getUsage('biz-4').count).toBe(1)
  })

  it('propagates upstream fetch failures', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'))

    const ops = new ApiGatewayOps(
      dbMock as unknown as ConstructorParameters<typeof ApiGatewayOps>[0],
      fetcher,
    )

    await expect(
      ops.proxyRequest({ businessId: 'biz-5', targetUrl: 'https://a.com', method: 'GET' }),
    ).rejects.toThrow('network down')
  })
})
