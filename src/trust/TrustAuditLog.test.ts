import { describe, expect, it } from 'vitest'
import { createTrustAuditEntry } from './trustTestUtils'
import { TrustAuditLog } from './TrustAuditLog'

describe('TrustAuditLog', () => {
  it('appends an entry', async () => {
    const auditLog = new TrustAuditLog()

    await auditLog.append(createTrustAuditEntry({ entryId: 'entry-1', tenantId: 'tenant-1' }))
    const entries = await auditLog.query({ tenantId: 'tenant-1' })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.entryId).toBe('entry-1')
  })

  it('queries by tenant', async () => {
    const auditLog = new TrustAuditLog()

    await auditLog.append(createTrustAuditEntry({ entryId: 'entry-1', tenantId: 'tenant-1' }))
    await auditLog.append(createTrustAuditEntry({ entryId: 'entry-2', tenantId: 'tenant-2' }))

    const entries = await auditLog.query({ tenantId: 'tenant-2' })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.tenantId).toBe('tenant-2')
  })

  it('queries by subject id', async () => {
    const auditLog = new TrustAuditLog()

    await auditLog.append(createTrustAuditEntry({ entryId: 'entry-1', subjectId: 'agent-1' }))
    await auditLog.append(createTrustAuditEntry({ entryId: 'entry-2', subjectId: 'agent-2' }))

    const entries = await auditLog.query({ subjectId: 'agent-2' })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.subjectId).toBe('agent-2')
  })

  it('queries by event type', async () => {
    const auditLog = new TrustAuditLog()

    await auditLog.append(
      createTrustAuditEntry({ entryId: 'entry-1', eventType: 'counterparty_blocked' }),
    )
    await auditLog.append(
      createTrustAuditEntry({ entryId: 'entry-2', eventType: 'identity_issued' }),
    )

    const entries = await auditLog.query({ eventType: 'counterparty_blocked' })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.eventType).toBe('counterparty_blocked')
  })

  it('queries by time range', async () => {
    const auditLog = new TrustAuditLog()

    await auditLog.append(
      createTrustAuditEntry({
        entryId: 'entry-1',
        timestamp: '2026-03-09T09:00:00.000Z',
      }),
    )
    await auditLog.append(
      createTrustAuditEntry({
        entryId: 'entry-2',
        timestamp: '2026-03-10T09:00:00.000Z',
      }),
    )

    const entries = await auditLog.query({
      fromTimestamp: '2026-03-10T00:00:00.000Z',
      toTimestamp: '2026-03-10T23:59:59.999Z',
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.entryId).toBe('entry-2')
  })

  it('returns immutable copies', async () => {
    const auditLog = new TrustAuditLog()

    await auditLog.append(createTrustAuditEntry({ entryId: 'entry-1' }))
    const entries = await auditLog.query({})
    const first = entries[0]

    if (!first) {
      throw new Error('expected an audit entry')
    }

    first.details.context = 'mutated'
    const freshEntries = await auditLog.query({})

    expect(freshEntries[0]?.details.context).toBe('base')
  })
})
