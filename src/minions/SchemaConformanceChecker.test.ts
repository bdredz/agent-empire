import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { SchemaConformanceChecker } from './SchemaConformanceChecker'

describe('SchemaConformanceChecker', () => {
    let checker: SchemaConformanceChecker

    beforeEach(() => {
        checker = new SchemaConformanceChecker()
    })

    it('passes conforming output', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number()
        })
        const data = { name: 'Alice', age: 30 }

        const result = checker.check(data, schema)
        expect(result.isConforming).toBe(true)
        expect(result.violations).toHaveLength(0)
    })

    it('detects missing required field', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number()
        })
        const data = { name: 'Bob' } // Missing age

        const result = checker.check(data, schema)
        expect(result.isConforming).toBe(false)
        expect(result.violations.some(v => v.path === 'age' && v.code === 'invalid_type')).toBe(true)
    })

    it('detects wrong type', () => {
        const schema = z.object({
            count: z.number()
        })
        const data = { count: '10' } // String instead of number

        const result = checker.check(data, schema)
        expect(result.isConforming).toBe(false)
        expect(result.violations.length).toBeGreaterThan(0)
        expect(result.violations[0]!.path).toBe('count')
        expect(result.violations[0]!.code).toBe('invalid_type')
    })

    it('ignores extra fields if schema allows (default zod behavior)', () => {
        const schema = z.object({
            id: z.string()
        })
        const data = { id: 'user-1', extra: 'should be ignored', another: 123 }

        const result = checker.check(data, schema)
        expect(result.isConforming).toBe(true)
        expect(result.violations).toHaveLength(0)
    })

    it('handles nested object validation', () => {
        const schema = z.object({
            user: z.object({
                profile: z.object({
                    email: z.string().email()
                })
            })
        })
        const data = { user: { profile: { email: 'not-an-email' } } }

        const result = checker.check(data, schema)
        expect(result.isConforming).toBe(false)
        expect(result.violations[0]!.path).toBe('user.profile.email')
    })

    it('handles array validation', () => {
        const schema = z.object({
            tags: z.array(z.string().min(2))
        })
        const data = { tags: ['valid', 'a', 123] } // 'a' is too short, 123 is wrong type

        const result = checker.check(data, schema)
        expect(result.isConforming).toBe(false)
        expect(result.violations.length).toBe(2)
        const paths = result.violations.map(v => v.path)
        expect(paths).toContain('tags.1')
        expect(paths).toContain('tags.2')
    })
})
