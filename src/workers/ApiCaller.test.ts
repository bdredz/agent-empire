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
    let fetchMock: ReturnType<typeof vi.fn>

    interface ApiCallerOutput {
        status: number
        statusText: string
        headers: Record<string, string>
        data: unknown
    }

    beforeEach(() => {
        caller = new ApiCaller()
        fetchMock = vi.fn()
        global.fetch = fetchMock as unknown as typeof fetch
    })

    it('1. happy path: fetches json successfully', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify({ ok: true })
        })

        const result = await caller.execute(createMockSpec('http://api.example.com/data'))

        expect(result.success).toBe(true)
        const output = result.output as ApiCallerOutput
        expect(output.status).toBe(200)
        expect(output.data).toEqual({ ok: true })
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
        fetchMock.mockRejectedValueOnce(new Error('Network offline'))
        const result = await caller.execute(createMockSpec('http://example.com'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Network offline')
    })

    it('6. http error: returns success false but structural output on 500', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: new Headers(),
            text: async () => 'Crash'
        })
        const result = await caller.execute(createMockSpec('http://example.com/fail'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('HTTP 500: Internal Server Error')
        const failOutput = result.output as ApiCallerOutput
        expect(failOutput.status).toBe(500)
        expect(failOutput.data).toBe('Crash')
    })
})
