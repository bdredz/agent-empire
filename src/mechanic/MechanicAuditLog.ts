import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { MechanicAction } from '@shared/types'
import { createChildLogger } from '@shared/logger'

const log = createChildLogger('mechanic-audit')
const DEFAULT_AUDIT_FILE = '.data/mechanic-audit.jsonl'

export type MechanicAuditStatus = 'accepted' | 'rejected' | 'executed' | 'failed'

export interface MechanicAuditRecord {
  readonly requestId: string
  readonly tenantId: string
  readonly businessUnitId: string
  readonly action: MechanicAction
  readonly status: MechanicAuditStatus
  readonly timestamp: string
  readonly reason?: string
}

export class MechanicAuditLog {
  constructor(private readonly filePath: string = DEFAULT_AUDIT_FILE) {}

  public async record(record: MechanicAuditRecord): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true })
    appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf-8')
  }

  public async list(): Promise<MechanicAuditRecord[]> {
    if (!existsSync(this.filePath)) {
      return []
    }

    const lines = readFileSync(this.filePath, 'utf-8').split('\n').filter((line) => line.trim().length > 0)
    const records: MechanicAuditRecord[] = []

    for (const line of lines) {
      const parsed = parseAuditLine(line)
      if (parsed) {
        records.push(parsed)
      }
    }

    return records
  }
}

function parseAuditLine(line: string): MechanicAuditRecord | null {
  try {
    return JSON.parse(line) as MechanicAuditRecord
  } catch (err) {
    log.warn({ err, line }, 'Skipping malformed mechanic audit line')
    return null
  }
}
