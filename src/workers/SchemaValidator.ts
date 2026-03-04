import { IWorker, WorkerResult } from './IWorker'
import { ModelTier, Capability, TaskSpec } from '@shared/types'
import { z } from 'zod'

export class SchemaValidator implements IWorker {
    readonly name = 'SchemaValidator'
    readonly modelTier = ModelTier.Tiny
    readonly capabilities: Capability[] = [Capability.DataTransform]

    async execute(spec: TaskSpec): Promise<WorkerResult> {
        const data = spec.inputs.parameters['data']
        const schemaDef = spec.inputs.parameters['schemaDef'] as Record<string, unknown> | undefined

        if (data === undefined) {
            return this.createFailureResult('Missing "data" parameter to validate', spec)
        }

        if (!schemaDef || typeof schemaDef !== 'object') {
            return this.createFailureResult('Missing or invalid "schemaDef" dictionary', spec)
        }

        if (spec.priority === 'low' && JSON.stringify(data).length > 50000) {
            return this.createFailureResult('Budget constraint exceeded: payload too large for low priority', spec)
        }

        try {
            const shape: Record<string, z.ZodTypeAny> = {}

            for (const [key, typeString] of Object.entries(schemaDef)) {
                switch (typeString) {
                    case 'string':
                        shape[key] = z.string()
                        break
                    case 'number':
                        shape[key] = z.number()
                        break
                    case 'boolean':
                        shape[key] = z.boolean()
                        break
                    default:
                        shape[key] = z.any()
                }
            }

            const schema = z.object(shape)

            let parsedData = data
            if (typeof data === 'string') {
                parsedData = JSON.parse(data)
            }

            const validResult = schema.safeParse(parsedData)

            if (!validResult.success) {
                return {
                    success: false,
                    artifacts: [],
                    output: validResult.error.format(),
                    usage: { tokensUsed: 0, toolCallsUsed: 0, wallTimeElapsedSec: 0, costUnitsUsed: 0 },
                    errors: ['Validation failed against Zod schema']
                }
            }

            return {
                success: true,
                artifacts: [],
                output: validResult.data,
                usage: {
                    tokensUsed: Math.ceil(JSON.stringify(data).length / 4),
                    toolCallsUsed: 0,
                    wallTimeElapsedSec: 0.1,
                    costUnitsUsed: 1
                }
            }

        } catch (err) {
            return this.createFailureResult(err instanceof Error ? err.message : 'Unknown validation error', spec)
        }
    }

    private createFailureResult(error: string, _spec: TaskSpec): WorkerResult {
        return {
            success: false,
            artifacts: [],
            output: null,
            usage: {
                tokensUsed: 0,
                toolCallsUsed: 0,
                wallTimeElapsedSec: 0,
                costUnitsUsed: 0
            },
            errors: [error]
        }
    }
}
