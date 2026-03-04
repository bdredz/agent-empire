import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalyticsCollectorOps } from './operations'
import { analyticsEventTable } from './schema'

describe('AnalyticsCollectorOps', () => {
    let ops: AnalyticsCollectorOps
    let dbMock: {
        insert: ReturnType<typeof vi.fn>
        values: ReturnType<typeof vi.fn>
        returning: ReturnType<typeof vi.fn>
        select: ReturnType<typeof vi.fn>
        from: ReturnType<typeof vi.fn>
        where: ReturnType<typeof vi.fn>
        orderBy: ReturnType<typeof vi.fn>
        limit: ReturnType<typeof vi.fn>
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
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
        }
        ops = new AnalyticsCollectorOps(dbMock as unknown as ConstructorParameters<typeof AnalyticsCollectorOps>[0])
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
