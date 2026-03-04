import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiCaller } from './ApiCaller'
import { TaskSpec, TaskId, TaskPriority, EvalMethod } from '@shared/types'

const createMockSpec = (url?: unknown, priority: TaskPriority = 'normal', additionalParams = {}): TaskSpec => ({
    taskId: 'task_6' as TaskId,
    taskType: 'api_call',
    priority,
    inputs: {
        parameters: {
            ...(url !== undefined ? { url } : {}),
            ...additionalParams
        },
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

describe('ApiCaller', () => {
    let caller: ApiCaller

    beforeEach(() => {
        caller = new ApiCaller()
        global.fetch = vi.fn() as any
    })

    it('1. happy path: fetches json successfully', async () => {
        ; (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ ok: true })
        })

        const result = await caller.execute(createMockSpec('http://api.example.com/data'))

        expect(result.success).toBe(true)
        expect((result.output as any).status).toBe(200)
        expect((result.output as any).data).toEqual({ ok: true })
    })

    it('2. empty input: fails when url is missing', async () => {
        const result = await caller.execute(createMockSpec())
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "url" parameter')
    })

    it('3. malformed input: fails on non-URLs', async () => {
        const result = await caller.execute(createMockSpec('not_a_url'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Malformed "url" parameter')
    })

    it('4. budget constraint: fails when usage condition is violated', async () => {
        const result = await caller.execute(createMockSpec('http://blocked-api.com', 'low'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Budget constraint exceeded or destination blocked')
    })

    it('5. error handling: handles network disconnect gracefully', async () => {
        ; (global.fetch as any).mockRejectedValueOnce(new Error('Network offline'))
        const result = await caller.execute(createMockSpec('http://example.com'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Network offline')
    })

    it('6. http error: returns success false but structural output on 500', async () => {
        ; (global.fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: new Headers(),
            text: async () => 'Crash'
        })
        const result = await caller.execute(createMockSpec('http://example.com/fail'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('HTTP 500: Internal Server Error')
        expect((result.output as any).status).toBe(500)
        expect((result.output as any).data).toBe('Crash')
    })
})
