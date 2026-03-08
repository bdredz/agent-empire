import { z } from 'zod'

export interface ConformanceViolation {
    readonly path: string
    readonly message: string
    readonly code: string
}

export interface ConformanceResult {
    readonly isConforming: boolean
    readonly violations: ConformanceViolation[]
}

export interface ISchemaConformanceChecker {
    check(data: unknown, schema: z.ZodTypeAny): ConformanceResult
}

export class SchemaConformanceChecker implements ISchemaConformanceChecker {
    public check(data: unknown, schema: z.ZodTypeAny): ConformanceResult {
        const result = schema.safeParse(data)

        if (result.success) {
            return {
                isConforming: true,
                violations: []
            }
        }

        const violations: ConformanceViolation[] = result.error.errors.map(err => ({
            path: err.path.join('.') || 'root',
            message: err.message,
            code: err.code
        }))

        return {
            isConforming: false,
            violations
        }
    }
}
