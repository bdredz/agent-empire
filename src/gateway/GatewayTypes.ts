import { CounterpartyRecord } from '@shared/types'
import { z } from 'zod'

export interface GatewayRequest {
  method: string
  path: string
  headers?: Record<string, string | undefined>
  body?: unknown
}

export interface GatewayResponse {
  status: number
  body: unknown
  headers?: Record<string, string>
}

export interface PaidRouteConfig {
  requiredAmount: number
  acceptedRails: string[]
  quoteEndpoint: string
}

export interface GatewayState {
  requestId: string
  tenantId?: string
  counterpartyId?: string
  trustStatus: CounterpartyRecord['trustStatus']
}

export interface GatewayRoute {
  method: string
  path: string
  schema?: z.ZodTypeAny
  handler: GatewayHandler
  paid?: PaidRouteConfig
  isHealthCheck?: boolean
}

export interface GatewayContext {
  request: GatewayRequest
  route: GatewayRoute
  state: GatewayState
}

export interface GatewayLogEntry {
  requestId: string
  method: string
  path: string
  status: number
  durationMs: number
  timestamp: string
}

export type GatewayHandler = (
  context: GatewayContext,
) => Promise<GatewayResponse> | GatewayResponse

export type GatewayMiddleware = (
  context: GatewayContext,
  next: () => Promise<GatewayResponse>,
) => Promise<GatewayResponse>
