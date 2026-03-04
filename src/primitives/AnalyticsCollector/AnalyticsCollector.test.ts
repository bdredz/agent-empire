import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalyticsCollectorOps } from './operations'
import { analyticsEventTable } from './schema'

describe('AnalyticsCollectorOps', () => {
    let ops: AnalyticsCollectorOps
    let dbMock: any

    beforeEach(() => {
        dbMock = {
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            returning: vi.fn(),
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
        }
        ops = new AnalyticsCollectorOps(dbMock as any)
    })

    it('1. happy path: trackEvent inserts row', async () => {
        dbMock.returning.mockResolvedValueOnce([{ id: 'ev_1' }])
        const result = await ops.trackEvent({ businessId: 'b1', eventName: 'click' })
        expect(dbMock.insert).toHaveBeenCalledWith(analyticsEventTable)
        expect(result).toEqual({ id: 'ev_1' })
    })

    it('2. happy path: queryEvents by businessId', async () => {
        dbMock.limit.mockResolvedValueOnce([{ id: 'ev_1' }])
        const result = await ops.queryEvents('b1')
        expect(dbMock.select).toHaveBeenCalled()
        expect(result).toEqual([{ id: 'ev_1' }])
    })

    it('3. happy path: queryEvents by businessId and eventName', async () => {
        dbMock.limit.mockResolvedValueOnce([{ id: 'ev_1' }])
        const result = await ops.queryEvents('b1', 'click')
        expect(dbMock.where).toHaveBeenCalled()
        expect(result.length).toBe(1)
    })

    it('4. happy path: clearEvents deletes rows', async () => {
        dbMock.returning.mockResolvedValueOnce([{ id: 'ev_1' }, { id: 'ev_2' }])
        const count = await ops.clearEvents('b1')
        expect(dbMock.delete).toHaveBeenCalledWith(analyticsEventTable)
        expect(count).toBe(2)
    })

    it('5. edge case: trackEvent with numeric properties', async () => {
        dbMock.returning.mockResolvedValueOnce([{ id: 'ev_3' }])
        await ops.trackEvent({ businessId: 'b1', eventName: 'purchase', numericValue: 99.99 })
        expect(dbMock.values).toHaveBeenCalledWith(expect.objectContaining({ numericValue: '99.99' }))
    })
})
