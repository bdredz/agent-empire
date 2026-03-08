import { describe, it, expect, beforeEach } from 'vitest'
import { SchemaValidator } from './SchemaValidator'
import { TaskSpec, TaskId, TaskPriority, EvalMethod } from '@shared/types'

const createMockSpec = (data?: unknown, schemaDef?: unknown, priority: TaskPriority = 'normal'): TaskSpec => ({
    taskId: 'task_5' as TaskId,
    taskType: 'schema_validation',
    priority,
    inputs: {
        parameters: {
            ...(data !== undefined ? { data } : {}),
            ...(schemaDef !== undefined ? { schemaDef } : {})
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

describe('SchemaValidator', () => {
    let validator: SchemaValidator

    beforeEach(() => {
        validator = new SchemaValidator()
    })

    it('1. happy path: validates object against zod schema definition', async () => {
        const data = { name: 'Alice', age: 30 }
        const schemaDef = { name: 'string', age: 'number' }
        const result = await validator.execute(createMockSpec(data, schemaDef))

        expect(result.success).toBe(true)
        expect(result.output).toMatchObject(data)
    })

    it('2. edge case: missing data fails validation', async () => {
        const result = await validator.execute(createMockSpec(undefined, { name: 'string' }))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing "data" parameter to validate')
    })

    it('3. malformed input: fails on missing or invalid schemaDef', async () => {
        const result = await validator.execute(createMockSpec({ name: 'Bob' }, 'invalidSchema'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Missing or invalid "schemaDef" dictionary')
    })

    it('4. budget constraint: fails when payload is too large for low priority', async () => {
        const hugeData = { key: 'a'.repeat(50001) }
        const result = await validator.execute(createMockSpec(hugeData, { key: 'string' }, 'low'))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Budget constraint exceeded: payload too large for low priority')
    })

    it('5. formatting: string data parses and validates', async () => {
        const dataStr = JSON.stringify({ name: 'Alice', age: 30 })
        const result = await validator.execute(createMockSpec(dataStr, { name: 'string', age: 'number' }))
        expect(result.success).toBe(true)
        expect(result.output).toMatchObject({ name: 'Alice', age: 30 })
    })

    it('6. validation failure: returns structural errors when types mismatch', async () => {
        const data = { name: 'Alice', age: 'thirty' } // should be number
        const result = await validator.execute(createMockSpec(data, { name: 'string', age: 'number' }))
        expect(result.success).toBe(false)
        expect(result.errors).toContain('Validation failed against Zod schema')
        // output should contain zod formatting error for age
        const formatted = result.output as { age?: { _errors: string[] } }
        expect(formatted.age?._errors).toBeDefined()
    })
})
