import { describe, it, expect, beforeEach } from 'vitest'
import { ContentFormatter } from './ContentFormatter'
import { TaskSpec, TaskId, TaskPriority, EvalMethod } from '@shared/types'

const createMockSpec = (content?: unknown, targetFormat?: unknown, priority: TaskPriority = 'normal'): TaskSpec => ({
    taskId: 'task_4' as TaskId,
    taskType: 'format_content',
    priority,
    inputs: {
        parameters: {
            ...(content !== undefined ? { content } : {}),
            ...(targetFormat !== undefined ? { targetFormat } : {})
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

describe('ContentFormatter', () => {
    let formatter: ContentFormatter

    beforeEach(() => {
        formatter = new ContentFormatter()
    })

    it('1. happy path: converts markdown to html correctly', async () => {
        const content = '# Title\n\n**Bold text**'
        const result = await formatter.execute(createMockSpec(content, 'html'))

        expect(result.success).toBe(true)
        expect(result.output).toContain('<h1>Title</h1>')
        expect(result.output).toContain('<strong>Bold text</strong>')
    })

    it('2. edge case: missing content fails validation', async () => {
        const result = await formatter.execute(createMockSpec(undefined, 'json'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "content" parameter')
    })

    it('3. malformed input: fails on missing or invalid targetFormat', async () => {
        const result = await formatter.execute(createMockSpec('hello', 'yaml'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Unsupported "targetFormat". Must be markdown, html, json, or text')
    })

    it('4. budget constraint: fails when content is too long for low priority', async () => {
        const longContent = 'a'.repeat(50001)
        const result = await formatter.execute(createMockSpec(longContent, 'text', 'low'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Budget constraint exceeded: content too large for low priority')
    })

    it('5. formatting: formats to json correctly', async () => {
        const content = 'Test string'
        const result = await formatter.execute(createMockSpec(content, 'json'))
        expect(result.success).toBe(true)
        expect(typeof result.output).toBe('string')
        const parsed = JSON.parse(result.output as string)
        expect(parsed.content).toBe('Test string')
    })
})
