import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeadTrackerOps } from '@primitives/LeadTracker/operations'
import { LeadStatus, leadTable } from '@primitives/LeadTracker/schema'

describe('LeadTrackerOps', () => {
  let ops: LeadTrackerOps
  let dbMock: {
    insert: ReturnType<typeof vi.fn>
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    execute: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    set: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    dbMock = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn(),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    }

    ops = new LeadTrackerOps(dbMock as unknown as ConstructorParameters<typeof LeadTrackerOps>[0])
  })

  it('creates a lead and returns id/status', async () => {
    dbMock.returning.mockResolvedValueOnce([{ id: 'lead-1', status: LeadStatus.New }])

    const result = await ops.createLead('biz-1', 'Ada Lovelace', 'ada@example.com', 'Analytical')

    expect(dbMock.insert).toHaveBeenCalledWith(leadTable)
    expect(result).toEqual({ id: 'lead-1', status: LeadStatus.New })
  })

  it('lists leads for a business', async () => {
    dbMock.execute.mockResolvedValueOnce([{ id: 'lead-1' }, { id: 'lead-2' }])

    const result = await ops.listLeads('biz-1')

    expect(dbMock.select).toHaveBeenCalled()
    expect(result).toHaveLength(2)
  })

  it('lists leads by status filter', async () => {
    dbMock.execute.mockResolvedValueOnce([{ id: 'lead-3', status: LeadStatus.Qualified }])

    const result = await ops.listLeads('biz-1', LeadStatus.Qualified)

    expect(result[0]?.status).toBe(LeadStatus.Qualified)
  })

  it('updates lead status', async () => {
    dbMock.returning.mockResolvedValueOnce([{ id: 'lead-4', status: LeadStatus.Won }])

    const result = await ops.updateLeadStatus('lead-4', LeadStatus.Won)

    expect(dbMock.update).toHaveBeenCalledWith(leadTable)
    expect(result?.status).toBe(LeadStatus.Won)
  })

  it('deletes an existing lead', async () => {
    dbMock.returning.mockResolvedValueOnce([{ id: 'lead-5' }])

    const result = await ops.deleteLead('lead-5')

    expect(dbMock.delete).toHaveBeenCalledWith(leadTable)
    expect(result).toBe(true)
  })

  it('returns false when deleting a missing lead', async () => {
    dbMock.returning.mockResolvedValueOnce([])

    const result = await ops.deleteLead('missing')

    expect(result).toBe(false)
  })
})
