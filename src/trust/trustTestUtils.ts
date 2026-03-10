import {
  AgentId,
  TrustAuditEntry,
  TrustAuditEntryId,
  createAgentId,
  createTrustAuditEntryId,
} from '@shared/types'

export interface TrustAuditOverrides {
  entryId?: string
  tenantId?: string
  eventType?: TrustAuditEntry['eventType']
  subjectId?: string
  actorId?: string
  details?: Record<string, unknown>
  timestamp?: string
}

export function createTrustAuditEntry(
  overrides: TrustAuditOverrides = {},
): TrustAuditEntry {
  const entryId = createTrustAuditEntryId(
    overrides.entryId ?? 'entry-default',
  )

  return {
    entryId,
    tenantId: overrides.tenantId ?? 'tenant-1',
    eventType: overrides.eventType ?? 'identity_issued',
    subjectId: overrides.subjectId ?? 'agent-1',
    actorId: overrides.actorId ?? 'system',
    details: overrides.details ?? { context: 'base' },
    timestamp: overrides.timestamp ?? '2026-03-10T00:00:00.000Z',
  }
}

export function createBrandedAgentId(agentId: string): AgentId {
  return createAgentId(agentId)
}

export function createBrandedTrustAuditEntryId(entryId: string): TrustAuditEntryId {
  return createTrustAuditEntryId(entryId)
}
