import { apiGatewayRequestTable } from '@primitives/ApiGateway/schema'
import { PrimitiveDb } from '@primitives/db'

type ApiGatewayDb = Pick<PrimitiveDb, 'insert'>

interface FetchResponse {
  readonly status: number
  text(): Promise<string>
  headers: { forEach(cb: (value: string, key: string) => void): void }
}

interface RateLimitWindow {
  count: number
  windowStartMs: number
}

export interface ProxyRequestInput {
  readonly businessId: string
  readonly targetUrl: string
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly headers?: Record<string, string>
  readonly body?: string
  readonly rateLimitPerMin?: number
}

export interface ProxyRequestResult {
  readonly status: number
  readonly body: string
  readonly headers: Record<string, string>
}

export class ApiGatewayOps {
  private readonly windows = new Map<string, RateLimitWindow>()

  constructor(
    private readonly db: ApiGatewayDb,
    private readonly fetcher: (url: string, init: RequestInit) => Promise<FetchResponse>,
    private readonly now: () => number = () => Date.now(),
  ) { }

  public async proxyRequest(input: ProxyRequestInput): Promise<ProxyRequestResult> {
    this.enforceRateLimit(input.businessId, input.rateLimitPerMin ?? 60)

    const response = await this.fetcher(input.targetUrl, {
      method: input.method,
      headers: input.headers,
      body: input.body,
    })

    const body = await response.text()
    const headers = this.headersToRecord(response.headers)

    await this.db.insert(apiGatewayRequestTable).values({
      businessId: input.businessId,
      targetUrl: input.targetUrl,
      method: input.method,
      responseStatus: response.status,
      responseBody: body,
      responseHeaders: headers,
    }).returning({ id: apiGatewayRequestTable.id })

    return { status: response.status, body, headers }
  }

  public getUsage(businessId: string): RateLimitWindow {
    const window = this.windows.get(businessId)
    if (!window) {
      return { count: 0, windowStartMs: this.now() }
    }
    return { ...window }
  }

  private enforceRateLimit(businessId: string, maxPerMinute: number): void {
    const current = this.windows.get(businessId)
    const now = this.now()

    if (!current || now - current.windowStartMs >= 60_000) {
      this.windows.set(businessId, { count: 1, windowStartMs: now })
      return
    }

    if (current.count >= maxPerMinute) {
      throw new Error(`Rate limit exceeded for ${businessId}`)
    }

    this.windows.set(businessId, { count: current.count + 1, windowStartMs: current.windowStartMs })
  }

  private headersToRecord(headers: FetchResponse['headers']): Record<string, string> {
    const collected: Record<string, string> = {}
    headers.forEach((value, key) => {
      collected[key] = value
    })
    return collected
  }
}
