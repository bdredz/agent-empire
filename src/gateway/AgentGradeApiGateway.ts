import { nanoid } from 'nanoid'
import { createChildLogger } from '@shared/logger'
import { ZodError } from 'zod'
import { GatewayError, isGatewayError, toErrorResponse } from './GatewayError'
import {
  GatewayContext,
  GatewayLogEntry,
  GatewayMiddleware,
  GatewayRequest,
  GatewayResponse,
  GatewayRoute,
} from './GatewayTypes'

const log = createChildLogger('agent-grade-gateway')

export interface AgentGradeApiGatewayOptions {
  trustMiddleware: GatewayMiddleware
  rateLimitMiddleware: GatewayMiddleware
  paymentChallengeMiddleware: GatewayMiddleware
  now?: () => Date
  idFactory?: () => string
}

export class AgentGradeApiGateway {
  private readonly routes: GatewayRoute[] = []
  private readonly logs: GatewayLogEntry[] = []
  private readonly now: () => Date
  private readonly idFactory: () => string
  private readonly middlewareChain: GatewayMiddleware[]

  constructor(options: AgentGradeApiGatewayOptions) {
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => nanoid())
    this.middlewareChain = [
      options.trustMiddleware,
      options.rateLimitMiddleware,
      options.paymentChallengeMiddleware,
    ]
  }

  public registerRoute(route: GatewayRoute): void {
    this.routes.push({ ...route })
  }

  public getLogs(): GatewayLogEntry[] {
    return this.logs.map((entry) => ({ ...entry }))
  }

  public async handle(request: GatewayRequest): Promise<GatewayResponse> {
    const requestId = `gateway_req_${this.idFactory()}`
    const startedAt = this.now().getTime()

    const route = this.findRoute(request)
    if (!route) {
      const response = toErrorResponse(
        new GatewayError(404, 'route_not_found', 'Route not found'),
        requestId,
      )
      this.appendLog(requestId, request, response.status, startedAt)
      return response
    }

    const context: GatewayContext = {
      request: {
        ...request,
        headers: request.headers ?? {},
      },
      route,
      state: {
        requestId,
        trustStatus: 'unknown',
      },
    }

    try {
      this.validateSchema(context)

      const response = route.isHealthCheck
        ? await Promise.resolve(route.handler(context))
        : await this.runMiddlewareChain(context)

      const normalized = normalizeResponse(response)
      this.appendLog(requestId, request, normalized.status, startedAt)
      return normalized
    } catch (error) {
      const normalized = this.normalizeError(error, requestId)
      this.appendLog(requestId, request, normalized.status, startedAt)
      return normalized
    }
  }

  private async runMiddlewareChain(context: GatewayContext): Promise<GatewayResponse> {
    const run = async (
      index: number,
      currentContext: GatewayContext,
    ): Promise<GatewayResponse> => {
      if (index >= this.middlewareChain.length) {
        return Promise.resolve(currentContext.route.handler(currentContext))
      }

      const middleware = this.middlewareChain[index]
      if (!middleware) {
        return Promise.resolve(currentContext.route.handler(currentContext))
      }

      return middleware(currentContext, () => run(index + 1, currentContext))
    }

    return run(0, context)
  }

  private validateSchema(context: GatewayContext): void {
    if (!context.route.schema) {
      return
    }

    const result = context.route.schema.safeParse(context.request.body)
    if (!result.success) {
      throw new GatewayError(
        400,
        'invalid_schema',
        'Invalid request schema',
        result.error.flatten(),
      )
    }
  }

  private normalizeError(error: unknown, requestId: string): GatewayResponse {
    if (isGatewayError(error)) {
      return toErrorResponse(error, requestId)
    }

    if (error instanceof ZodError) {
      return toErrorResponse(
        new GatewayError(400, 'invalid_schema', 'Invalid request schema', error.flatten()),
        requestId,
      )
    }

    const message = error instanceof Error ? error.message : 'Internal server error'
    return toErrorResponse(new GatewayError(500, 'internal_error', message), requestId)
  }

  private findRoute(request: GatewayRequest): GatewayRoute | undefined {
    const method = request.method.toUpperCase()
    return this.routes.find(
      (route) => route.method.toUpperCase() === method && route.path === request.path,
    )
  }

  private appendLog(
    requestId: string,
    request: GatewayRequest,
    status: number,
    startedAtMs: number,
  ): void {
    const entry: GatewayLogEntry = {
      requestId,
      method: request.method.toUpperCase(),
      path: request.path,
      status,
      durationMs: this.now().getTime() - startedAtMs,
      timestamp: this.now().toISOString(),
    }

    this.logs.push(entry)
    log.info(entry, 'gateway_request')
  }
}

function normalizeResponse(response: GatewayResponse): GatewayResponse {
  return {
    ...response,
    headers: response.headers ?? {},
  }
}
