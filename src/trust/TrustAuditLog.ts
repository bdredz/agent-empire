import { TrustAuditEntry } from '@shared/types'
import { createChildLogger } from '@shared/logger'

const log = createChildLogger('trust-audit')

export interface TrustAuditQuery {
  tenantId?: string
  subjectId?: string
  eventType?: TrustAuditEntry['eventType']
  fromTimestamp?: string
  toTimestamp?: string
}

export class TrustAuditLog {
  private readonly entries: TrustAuditEntry[] = []

  public async append(entry: TrustAuditEntry): Promise<void> {
    const storedEntry = cloneEntry(entry)
    this.entries.push(storedEntry)
    log.info({ trustAuditEntry: storedEntry }, 'Trust audit entry appended')
  }

  public async query(filters: TrustAuditQuery): Promise<TrustAuditEntry[]> {
    const results = this.entries.filter((entry) => {
      if (filters.tenantId && entry.tenantId !== filters.tenantId) {
        return false
      }

      if (filters.subjectId && entry.subjectId !== filters.subjectId) {
        return false
      }

      if (filters.eventType && entry.eventType !== filters.eventType) {
        return false
      }

      if (!isInRange(entry.timestamp, filters.fromTimestamp, filters.toTimestamp)) {
        return false
      }

      return true
    })

    return results.map(cloneEntry)
  }
}

function isInRange(
  timestamp: string,
  fromTimestamp?: string,
  toTimestamp?: string,
): boolean {
  const current = Date.parse(timestamp)
  if (Number.isNaN(current)) {
    return false
  }

  if (fromTimestamp) {
    const start = Date.parse(fromTimestamp)
    if (!Number.isNaN(start) && current < start) {
      return false
    }
  }

  if (toTimestamp) {
    const end = Date.parse(toTimestamp)
    if (!Number.isNaN(end) && current > end) {
      return false
    }
  }

  return true
}

function cloneEntry(entry: TrustAuditEntry): TrustAuditEntry {
  return {
    ...entry,
    details: { ...entry.details },
  }
}
