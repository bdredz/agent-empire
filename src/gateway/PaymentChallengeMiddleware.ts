import { createReceiptId } from '@shared/types'
import { ReceiptService } from '../commerce/ReceiptService'
import { GatewayMiddleware, PaidRouteConfig } from './GatewayTypes'

export interface PaymentChallengeMiddlewareOptions {
  defaultTenantId?: string
  proofHeader?: string
  tenantHeader?: string
  maxProofAgeSec?: number
  now?: () => Date
}

export class PaymentChallengeMiddleware {
  private readonly defaultTenantId: string
  private readonly proofHeader: string
  private readonly tenantHeader: string
  private readonly maxProofAgeSec: number
  private readonly now: () => Date

  constructor(
    private readonly receiptService: ReceiptService,
    options: Partial<PaymentChallengeMiddlewareOptions> = {},
  ) {
    this.defaultTenantId = options.defaultTenantId ?? 'tenant-default'
    this.proofHeader = options.proofHeader ?? 'x-payment-proof'
    this.tenantHeader = options.tenantHeader ?? 'x-tenant-id'
    this.maxProofAgeSec = options.maxProofAgeSec ?? 300
    this.now = options.now ?? (() => new Date())
  }

  public createMiddleware(): GatewayMiddleware {
    return async (context, next) => {
      const paidConfig = context.route.paid
      if (!paidConfig) {
        return next()
      }

      const proof = readHeader(context.request.headers, this.proofHeader)
      if (!proof) {
        return this.challengeResponse('payment_required', 'Payment proof required', paidConfig)
      }

      const tenantId =
        readHeader(context.request.headers, this.tenantHeader)
        ?? context.state.tenantId
        ?? this.defaultTenantId

      const receipt = await this.receiptService.get(tenantId, createReceiptId(proof))
      if (!receipt) {
        return this.challengeResponse(
          'invalid_payment_proof',
          'Payment proof is invalid',
          paidConfig,
        )
      }

      if (receipt.status !== 'settled' && receipt.status !== 'credited') {
        return this.challengeResponse(
          'invalid_payment_proof',
          'Payment proof is not settled',
          paidConfig,
        )
      }

      const ageMs = this.now().getTime() - new Date(receipt.createdAt).getTime()
      if (ageMs > this.maxProofAgeSec * 1000) {
        return this.challengeResponse(
          'expired_payment_proof',
          'Payment proof has expired',
          paidConfig,
        )
      }

      if (receipt.amount < paidConfig.requiredAmount) {
        return this.challengeResponse(
          'insufficient_payment_proof',
          'Payment proof amount is insufficient',
          paidConfig,
        )
      }

      return next()
    }
  }

  private challengeResponse(
    code: string,
    message: string,
    paidConfig: PaidRouteConfig,
  ) {
    return {
      status: 402,
      body: {
        error: {
          code,
          message,
        },
        challenge: {
          requiredAmount: paidConfig.requiredAmount,
          acceptedRails: [...paidConfig.acceptedRails],
          quoteEndpoint: paidConfig.quoteEndpoint,
        },
      },
      headers: {},
    }
  }
}

function readHeader(
  headers: Record<string, string | undefined> | undefined,
  key: string,
): string | undefined {
  if (!headers) {
    return undefined
  }

  const expected = key.toLowerCase()
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === expected) {
      return value
    }
  }

  return undefined
}
