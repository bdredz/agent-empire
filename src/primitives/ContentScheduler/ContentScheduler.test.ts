import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContentSchedulerOps } from './operations'
import { ContentScheduleStatus, scheduledContentTable } from './schema'

describe('ContentSchedulerOps', () => {
    let ops: ContentSchedulerOps
    let dbMock: any

    beforeEach(() => {
        dbMock = {
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            returning: vi.fn(),
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
        }
        ops = new ContentSchedulerOps(dbMock as any)
    })

    it('1. happy path: queueContent inserts into db and returns ID', async () => {
        const mockReturn = { id: 'test_id', status: 'pending' }
        dbMock.returning.mockResolvedValueOnce([mockReturn])

        const date = new Date()
        const result = await ops.queueContent('biz_1', 'Hello world', ['twitter'], date)

        expect(dbMock.insert).toHaveBeenCalledWith(scheduledContentTable)
        expect(result).toEqual(mockReturn)
    })

    it('2. happy path: listScheduledContent filters by businessId', async () => {
        const mockData = [{ id: 'test_1' }]
        dbMock.where.mockResolvedValueOnce(mockData)

        const result = await ops.listScheduledContent('biz_1')
        expect(dbMock.select).toHaveBeenCalled()
        expect(dbMock.from).toHaveBeenCalledWith(scheduledContentTable)
        expect(result).toEqual(mockData)
    })

    it('3. happy path: listScheduledContent filters by businessId and status', async () => {
        const mockData = [{ id: 'test_1' }]
        dbMock.where.mockResolvedValueOnce(mockData)

        const result = await ops.listScheduledContent('biz_1', ContentScheduleStatus.Pending)
        expect(result).toEqual(mockData)
        expect(dbMock.where).toHaveBeenCalled()
    })

    it('4. happy path: cancelScheduledContent deletes row and returns true if found', async () => {
        dbMock.returning.mockResolvedValueOnce([{ id: 'test_1' }])

        const result = await ops.cancelScheduledContent('test_1')
        expect(dbMock.delete).toHaveBeenCalledWith(scheduledContentTable)
        expect(result).toBe(true)
    })

    it('5. edge case: cancelScheduledContent returns false if not found', async () => {
        dbMock.returning.mockResolvedValueOnce([])

        const result = await ops.cancelScheduledContent('missing_id')
        expect(result).toBe(false)
    })

    it('6. happy path: updateStatus updates status and returns row', async () => {
        const mockReturn = { id: 'test_1', status: 'published' }
        dbMock.returning.mockResolvedValueOnce([mockReturn])

        const result = await ops.updateStatus('test_1', ContentScheduleStatus.Published)
        expect(dbMock.update).toHaveBeenCalledWith(scheduledContentTable)
        expect(dbMock.set).toHaveBeenCalledWith({ status: 'published' })
        expect(result).toEqual(mockReturn)
    })
})
