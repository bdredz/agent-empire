import { CounterpartyRecord } from '@shared/types'
import { GatewayMiddleware } from './GatewayTypes'

interface RateLimitWindow {
  count: number
  resetAtMs: number
}

export interface RateLimitDecision {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSec: number
}

export interface CounterpartyRateLimiterOptions {
  windowMs?: number
  limits?: Partial<Record<CounterpartyRecord['trustStatus'], number>>
  nowMs?: () => number
}

export class CounterpartyRateLimiter {
  private readonly windows = new Map<string, RateLimitWindow>()
  private readonly windowMs: number
  private readonly nowMs: () => number
  private readonly limits: Record<CounterpartyRecord['trustStatus'], number>

  constructor(options: Partial<CounterpartyRateLimiterOptions> = {}) {
    this.windowMs = options.windowMs ?? 60_000
    this.nowMs = options.nowMs ?? (() => Date.now())
    this.limits = {
      trusted: options.limits?.trusted ?? 100,
      watch: options.limits?.watch ?? 20,
      unknown: options.limits?.unknown ?? 50,
      blocked: options.limits?.blocked ?? 0,
    }
  }

  public check(
    counterpartyId: string | undefined,
    trustStatus: CounterpartyRecord['trustStatus'],
  ): RateLimitDecision {
    const status = trustStatus
    const limit = this.limits[status]
    const key = `${counterpartyId ?? 'anonymous'}:${status}`
    const now = this.nowMs()

    let window = this.windows.get(key)
    if (!window || now >= window.resetAtMs) {
      window = { count: 0, resetAtMs: now + this.windowMs }
      this.windows.set(key, window)
    }

    if (limit === 0 || window.count >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((window.resetAtMs - now) / 1000)),
      }
    }

    window.count += 1
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - window.count),
      retryAfterSec: Math.max(0, Math.ceil((window.resetAtMs - now) / 1000)),
    }
  }

  public createMiddleware(): GatewayMiddleware {
    return async (context, next) => {
      const decision = this.check(
        context.state.counterpartyId,
        context.state.trustStatus,
      )

      if (!decision.allowed) {
        return {
          status: 429,
          body: {
            error: {
              code: 'rate_limited',
              message: 'Rate limit exceeded',
            },
          },
          headers: {
            'Retry-After': decision.retryAfterSec.toString(),
            'X-RateLimit-Limit': decision.limit.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      }

      const response = await next()
      const headers: Record<string, string> = {
        ...(response.headers ?? {}),
        'X-RateLimit-Limit': decision.limit.toString(),
        'X-RateLimit-Remaining': decision.remaining.toString(),
      }

      return {
        status: response.status,
        body: response.body,
        headers,
      }
    }
  }
}
