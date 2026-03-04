import { describe, it, expect, beforeEach } from 'vitest'
import { NotificationSender } from './NotificationSender'
import { TaskSpec, TaskId, TaskPriority, EvalMethod } from '@shared/types'

const createMockSpec = (message?: unknown, channel?: unknown, priority: TaskPriority = 'normal'): TaskSpec => ({
    taskId: 'task_7' as TaskId,
    taskType: 'notification',
    priority,
    inputs: {
        parameters: {
            ...(message !== undefined ? { message } : {}),
            ...(channel !== undefined ? { channel } : {})
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

describe('NotificationSender', () => {
    let sender: NotificationSender

    beforeEach(() => {
        sender = new NotificationSender()
    })

    it('1. happy path: sends notification to valid channel', async () => {
        const result = await sender.execute(createMockSpec('System is down!', 'slack'))
        expect(result.success).toBe(true)
        expect((result.output as any).status).toBe('delivered')
        expect((result.output as any).channel).toBe('slack')
    })

    it('2. empty input: array of errors on missing message', async () => {
        const result = await sender.execute(createMockSpec(undefined, 'email'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "message" parameter')
    })

    it('3. malformed input: fails on missing channel', async () => {
        const result = await sender.execute(createMockSpec('text here', undefined))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "channel" parameter')
    })

    it('4. budget constraint: fails when priority too low for channel', async () => {
        const result = await sender.execute(createMockSpec('Test', 'sms', 'low'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Budget constraint exceeded: SMS not allowed for low priority')
    })

    it('5. logic evaluation: correctly fails on unknown channel', async () => {
        const result = await sender.execute(createMockSpec('Test', 'pigeon'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Unknown channel: pigeon')
    })
})
