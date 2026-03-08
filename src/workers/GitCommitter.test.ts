import { describe, it, expect, beforeEach } from 'vitest'
import { GitCommitter } from './GitCommitter'
import { TaskSpec, TaskId, TaskPriority, EvalMethod } from '@shared/types'

const createMockSpec = (diff?: unknown, context?: unknown, priority: TaskPriority = 'normal'): TaskSpec => ({
    taskId: 'task_3' as TaskId,
    taskType: 'git_commit',
    priority,
    inputs: {
        parameters: {
            ...(diff !== undefined ? { diff } : {}),
            ...(context !== undefined ? { context } : {})
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

describe('GitCommitter', () => {
    let committer: GitCommitter

    beforeEach(() => {
        committer = new GitCommitter()
    })

    it('1. happy path: parses diff and context into formatted message', async () => {
        const diff = `--- a/file.ts\n+++ b/file.ts\n+ added line\n- removed line`
        const context = 'add new feature to file'
        const result = await committer.execute(createMockSpec(diff, context))

        expect(result.success).toBe(true)
        expect(result.output).toContain('feat: add new feature to file')
        expect(result.output).toContain('- Changes exactly: 1 insertions, 1 deletions.')
    })

    it('2. empty input: array of errors on missing diff', async () => {
        const result = await committer.execute(createMockSpec(undefined, 'some context'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "diff" parameter')
    })

    it('3. malformed input: fails on missing context parameter', async () => {
        const result = await committer.execute(createMockSpec('diff string', undefined))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "context" parameter')
    })

    it('4. budget constraint: fails when diff is extremely long on low priority', async () => {
        const longDiff = 'a'.repeat(50001)
        const result = await committer.execute(createMockSpec(longDiff, 'some context', 'low'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Budget constraint exceeded: diff too large for low priority')
    })

    it('5. logic evaluation: correctly classifies bug fix based on context', async () => {
        const diff = `+ line`
        const context = 'fix the crash'
        const result = await committer.execute(createMockSpec(diff, context))
        expect(result.success).toBe(true)
        expect(result.output).toContain('fix: fix the crash')
    })
})
