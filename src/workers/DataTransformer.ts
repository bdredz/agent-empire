import { IWorker, WorkerResult } from './IWorker'
import { ModelTier, Capability, TaskSpec } from '@shared/types'

export class DataTransformer implements IWorker {
    readonly name = 'DataTransformer'
    readonly modelTier = ModelTier.Tiny
    readonly capabilities: Capability[] = [Capability.DataTransform]

    async execute(spec: TaskSpec): Promise<WorkerResult> {
        const data = spec.inputs.parameters['data']
        const operation = spec.inputs.parameters['operation']
        const config = spec.inputs.parameters['config'] as Record<string, unknown> | undefined

        if (!Array.isArray(data)) {
            return this.createFailureResult('Missing or invalid "data" parameter: must be an array', spec)
        }

        if (typeof operation !== 'string') {
            return this.createFailureResult('Missing or invalid "operation" parameter', spec)
        }

        const permittedOps = ['filter', 'map', 'aggregate']
        if (!permittedOps.includes(operation.toLowerCase())) {
            return this.createFailureResult(`Unsupported operation: ${operation}`, spec)
        }

        if (!config || typeof config !== 'object') {
            return this.createFailureResult('Missing or invalid "config" parameter', spec)
        }

        if (spec.priority === 'low' && data.length > 10000) {
            return this.createFailureResult('Budget constraint exceeded: array too large for low priority', spec)
        }

        try {
            let outputData: unknown

            switch (operation.toLowerCase()) {
                case 'filter': {
                    const field = config['field'] as string
                    const value = config['value']
                    if (!field) throw new Error('config.field is required for filter')
                    outputData = data.filter(item => {
                        if (!item || typeof item !== 'object') return false
                        return (item as Record<string, unknown>)[field] === value
                    })
                    break
                }
                case 'map': {
                    const field = config['field'] as string
                    const target = config['target'] as string
                    if (!field || !target) throw new Error('config.field and config.target are required for map')
                    outputData = data.map(item => {
                        if (!item || typeof item !== 'object') return item
                        const newItem: Record<string, unknown> = { ...(item as Record<string, unknown>) }
                        newItem[target] = newItem[field]
                        delete newItem[field]
                        return newItem
                    })
                    break
                }
                case 'aggregate': {
                    const field = config['field'] as string
                    if (!field) throw new Error('config.field is required for aggregate (sum)')
                    outputData = data.reduce((sum, item) => {
                        if (item && typeof item === 'object') {
                            const fieldVal = (item as Record<string, unknown>)[field]
                            if (typeof fieldVal === 'number') return sum + fieldVal
                        }
                        return sum
                    }, 0)
                    break
                }
            }

            return {
                success: true,
                artifacts: [],
                output: outputData,
                usage: {
                    tokensUsed: 0,
                    toolCallsUsed: 0,
                    wallTimeElapsedSec: 0.1,
                    costUnitsUsed: 1
                }
            }

        } catch (err) {
            return this.createFailureResult(err instanceof Error ? err.message : 'Unknown transform error', spec)
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
