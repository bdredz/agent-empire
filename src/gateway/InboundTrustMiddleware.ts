import { nanoid } from 'nanoid'
import {
  CounterpartyRecord,
  createCounterpartyId,
  createTrustAuditEntryId,
} from '@shared/types'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry'
import { TrustAuditLog } from '../trust/TrustAuditLog'
import { GatewayError } from './GatewayError'
import { GatewayMiddleware } from './GatewayTypes'

export interface InboundTrustMiddlewareOptions {
  defaultTenantId?: string
  selfAgentId?: string
  now?: () => Date
  identityHeader?: string
}

export class InboundTrustMiddleware {
  private readonly defaultTenantId: string
  private readonly selfAgentId?: string
  private readonly now: () => Date
  private readonly identityHeader: string

  constructor(
    private readonly counterpartyRegistry: CounterpartyRegistry,
    private readonly trustAuditLog: TrustAuditLog,
    options: Partial<InboundTrustMiddlewareOptions> = {},
  ) {
    this.defaultTenantId = options.defaultTenantId ?? 'tenant-default'
    this.selfAgentId = options.selfAgentId
    this.now = options.now ?? (() => new Date())
    this.identityHeader = options.identityHeader ?? 'x-counterparty-id'
  }

  public createMiddleware(): GatewayMiddleware {
    return async (context, next) => {
      const tenantId =
        readHeader(context.request.headers, 'x-tenant-id') ?? this.defaultTenantId
      const counterpartyId = this.extractCounterpartyId(context.request.headers)

      if (counterpartyId && this.isRecursiveTraffic(counterpartyId)) {
        await this.appendAudit(tenantId, counterpartyId, 'unknown', context.request.path)
        throw new GatewayError(409, 'recursive_traffic', 'Recursive agent traffic suppressed')
      }

      let trustStatus: CounterpartyRecord['trustStatus'] = 'unknown'
      if (counterpartyId) {
        const counterparty = await this.counterpartyRegistry.get(
          tenantId,
          createCounterpartyId(counterpartyId),
        )
        if (counterparty) {
          trustStatus = counterparty.trustStatus
        }
      }

      context.state.tenantId = tenantId
      context.state.counterpartyId = counterpartyId
      context.state.trustStatus = trustStatus

      await this.appendAudit(
        tenantId,
        counterpartyId ?? 'unknown',
        trustStatus,
        context.request.path,
      )

      if (trustStatus === 'blocked') {
        throw new GatewayError(403, 'counterparty_blocked', 'Counterparty is blocked')
      }

      return next()
    }
  }

  private extractCounterpartyId(
    headers: Record<string, string | undefined> | undefined,
  ): string | undefined {
    const direct = readHeader(headers, this.identityHeader)
    if (direct) {
      return direct
    }

    const agentId = readHeader(headers, 'x-agent-id')
    if (agentId) {
      return agentId
    }

    const encodedIdentity = readHeader(headers, 'x-agent-identity')
    if (encodedIdentity) {
      try {
        const parsed = JSON.parse(encodedIdentity) as {
          counterpartyId?: string
          agentId?: string
        }
        if (parsed.counterpartyId) {
          return parsed.counterpartyId
        }
        if (parsed.agentId) {
          return parsed.agentId
        }
      } catch {
        return undefined
      }
    }

    const authorization = readHeader(headers, 'authorization')
    if (!authorization) {
      return undefined
    }

    if (authorization.startsWith('Agent ')) {
      return authorization.slice('Agent '.length).trim() || undefined
    }

    return undefined
  }

  private isRecursiveTraffic(counterpartyId: string): boolean {
    if (!this.selfAgentId) {
      return false
    }

    return counterpartyId === this.selfAgentId
  }

  private async appendAudit(
    tenantId: string,
    subjectId: string,
    trustStatus: CounterpartyRecord['trustStatus'],
    path: string,
  ): Promise<void> {
    await this.trustAuditLog.append({
      entryId: createTrustAuditEntryId(`trust_audit_${nanoid()}`),
      tenantId,
      eventType: trustStatus === 'blocked' ? 'counterparty_blocked' : 'verification_override',
      subjectId,
      actorId: 'inbound_trust_middleware',
      details: {
        path,
        trustStatus,
      },
      timestamp: this.now().toISOString(),
    })
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
