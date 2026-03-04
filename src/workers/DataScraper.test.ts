import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataScraper } from './DataScraper'
import { TaskSpec, TaskId, TaskPriority, EvalMethod } from '@shared/types'

const createMockSpec = (url?: unknown, priority: TaskPriority = 'normal'): TaskSpec => ({
    taskId: 'task_1' as TaskId,
    taskType: 'scrape',
    priority,
    inputs: {
        parameters: url !== undefined ? { url } : {},
        artifactRefs: []
    },
    expectedOutputs: [],
    successCriteria: {
        description: 'success',
        evalMethod: 'deterministic' as EvalMethod
    },
    retryPolicy: {
        maxAttempts: 1,
        backoffMs: 0,
        jitter: false,
        escalateAfter: 1
    }
})

describe('DataScraper', () => {
    let scraper: DataScraper

    beforeEach(() => {
        scraper = new DataScraper()
        global.fetch = vi.fn() as any
    })

    it('1. happy path: scrapes and returns structured JSON', async () => {
        const mockHtml = `<html><head><title>Test Page</title><meta name="description" content="Test Desc"></head><body><h1>Hello</h1><p>World</p></body></html>`
            ; (global.fetch as any).mockResolvedValueOnce(new Response(mockHtml, { status: 200 }))

        const result = await scraper.execute(createMockSpec('http://example.com'))

        expect(result.success).toBe(true)
        expect(result.output).toMatchObject({
            url: 'http://example.com',
            title: 'Test Page',
            description: 'Test Desc',
            content: 'Hello World'
        })
    })

    it('2. empty input: array of errors on missing URL', async () => {
        const result = await scraper.execute(createMockSpec())
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "url" parameter')
    })

    it('3. malformed input: fails on non-URLs', async () => {
        const result = await scraper.execute(createMockSpec('not_a_url'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Malformed "url" parameter')
    })

    it('4. budget constraint: fails when usage condition is violated (blocked)', async () => {
        const result = await scraper.execute(createMockSpec('http://blocked.com', 'low'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Budget constraint exceeded or site blocked')
    })

    it('5. error handling: handles non-200 responses', async () => {
        ; (global.fetch as any).mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
        const result = await scraper.execute(createMockSpec('http://example.com'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('HTTP status 404')
    })

    it('6. error handling: handles network layer errors', async () => {
        ; (global.fetch as any).mockRejectedValueOnce(new Error('Network disconnected'))
        const result = await scraper.execute(createMockSpec('http://example.com'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Network disconnected')
    })
})
