import { GatewayResponse } from './GatewayTypes'

export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export const isGatewayError = (error: unknown): error is GatewayError =>
  error instanceof GatewayError

export const toErrorResponse = (
  error: GatewayError,
  requestId: string,
): GatewayResponse => ({
  status: error.status,
  body: {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
    requestId,
  },
  headers: {},
})
