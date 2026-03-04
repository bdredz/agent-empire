import { describe, it, expect, beforeEach } from 'vitest'
import { Summarizer } from './Summarizer'
import { TaskSpec, TaskId, TaskPriority, EvalMethod } from '@shared/types'

const createMockSpec = (text?: unknown, priority: TaskPriority = 'normal'): TaskSpec => ({
    taskId: 'task_2' as TaskId,
    taskType: 'summarize',
    priority,
    inputs: {
        parameters: text !== undefined ? { text } : {},
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

describe('Summarizer', () => {
    let summarizer: Summarizer

    beforeEach(() => {
        summarizer = new Summarizer()
    })

    it('1. happy path: returns condensed bullets from text', async () => {
        const text = 'First sentence here. Second sentence is this. And a third one.'
        const result = await summarizer.execute(createMockSpec(text))

        expect(result.success).toBe(true)
        expect(result.output).toContain('- First sentence here.')
        expect(result.output).toContain('- Second sentence is this.')
        expect(result.output).toContain('- And a third one.')
    })

    it('2. empty input: fails when text parameter is empty', async () => {
        const result = await summarizer.execute(createMockSpec('   '))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Input "text" cannot be empty')
    })

    it('3. malformed input: fails on missing text parameter', async () => {
        const result = await summarizer.execute(createMockSpec())
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "text" parameter')
    })

    it('4. budget constraint: fails when text is extremely long on low priority', async () => {
        const longText = 'a'.repeat(100001)
        const result = await summarizer.execute(createMockSpec(longText, 'low'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Budget constraint exceeded: text too long for low priority')
    })

    it('5. edge case: returns fallback when text has no sentences', async () => {
        const result = await summarizer.execute(createMockSpec('abc'))
        expect(result.success).toBe(true)
        expect(result.output).toContain('- No meaningful sentences to summarize.')
    })
})
