import { describe, it, expect, beforeEach } from 'vitest'
import { DataTransformer } from './DataTransformer'
import { TaskSpec, TaskId, TaskPriority, EvalMethod } from '@shared/types'

const createMockSpec = (data?: unknown, operation?: unknown, config?: unknown, priority: TaskPriority = 'normal'): TaskSpec => ({
    taskId: 'task_8' as TaskId,
    taskType: 'data_transform',
    priority,
    inputs: {
        parameters: {
            ...(data !== undefined ? { data } : {}),
            ...(operation !== undefined ? { operation } : {}),
            ...(config !== undefined ? { config } : {})
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

describe('DataTransformer', () => {
    let transformer: DataTransformer

    beforeEach(() => {
        transformer = new DataTransformer()
    })

    it('1. happy path: filter operation removes mismatched items', async () => {
        const data = [{ id: 1, type: 'A' }, { id: 2, type: 'B' }]
        const result = await transformer.execute(createMockSpec(data, 'filter', { field: 'type', value: 'A' }))
        expect(result.success).toBe(true)
        expect(result.output).toEqual([{ id: 1, type: 'A' }])
    })

    it('2. happy path: map operation renames properties', async () => {
        const data = [{ oldKey: 'val' }]
        const result = await transformer.execute(createMockSpec(data, 'map', { field: 'oldKey', target: 'newKey' }))
        expect(result.success).toBe(true)
        expect(result.output).toEqual([{ newKey: 'val' }])
    })

    it('3. happy path: aggregate operation sums numerical properties', async () => {
        const data = [{ cost: 10 }, { cost: 20 }, { cost: 'NaN' }]
        const result = await transformer.execute(createMockSpec(data, 'aggregate', { field: 'cost' }))
        expect(result.success).toBe(true)
        expect(result.output).toBe(30)
    })

    it('4. empty/malformed input: fails when data is not an array', async () => {
        const result = await transformer.execute(createMockSpec({ not: 'array' }, 'filter', {}))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "data" parameter: must be an array')
    })

    it('5. malformed input: fails on missing or invalid operation', async () => {
        const result = await transformer.execute(createMockSpec([], undefined, {}))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "operation" parameter')
    })

    it('6. error handling: handles missing config fields gracefully', async () => {
        const result = await transformer.execute(createMockSpec([{}], 'map', {}))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('config.field and config.target are required for map')
    })

    it('7. budget constraint: prevents transforming massive data on low priority', async () => {
        const massive = new Array(10001).fill({ a: 1 })
        const result = await transformer.execute(createMockSpec(massive, 'filter', {}, 'low'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Budget constraint exceeded: array too large for low priority')
    })
})
