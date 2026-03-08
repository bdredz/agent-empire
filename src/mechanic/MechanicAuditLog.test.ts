import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { MechanicAuditLog } from './MechanicAuditLog'

describe('MechanicAuditLog', () => {
  it('records and lists audit records', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mechanic-audit-'))
    const file = join(dir, 'audit.jsonl')
    const auditLog = new MechanicAuditLog(file)

    await auditLog.record({
      requestId: 'req-1',
      tenantId: 'tenant-1',
      businessUnitId: 'biz-1',
      action: 'create_database',
      status: 'executed',
      timestamp: new Date().toISOString(),
    })

    const records = await auditLog.list()

    expect(records).toHaveLength(1)
    expect(records[0]?.requestId).toBe('req-1')
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns empty list when file does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mechanic-audit-'))
    const file = join(dir, 'missing.jsonl')
    const auditLog = new MechanicAuditLog(file)

    const records = await auditLog.list()

    expect(records).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('skips malformed lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mechanic-audit-'))
    const file = join(dir, 'audit.jsonl')

    writeFileSync(
      file,
      [
        '{"requestId":"req-1","tenantId":"tenant-1","businessUnitId":"biz-1","action":"create_repo","status":"executed","timestamp":"2026-03-08T00:00:00.000Z"}',
        'bad-json-line',
      ].join('\n'),
      'utf-8'
    )

    const auditLog = new MechanicAuditLog(file)
    const records = await auditLog.list()

    expect(records).toHaveLength(1)
    expect(records[0]?.action).toBe('create_repo')
    rmSync(dir, { recursive: true, force: true })
  })
})
