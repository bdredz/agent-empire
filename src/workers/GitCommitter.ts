import { IWorker, WorkerResult } from './IWorker'
import { ModelTier, Capability, TaskSpec } from '@shared/types'

export class GitCommitter implements IWorker {
    readonly name = 'GitCommitter'
    readonly modelTier = ModelTier.Fast
    readonly capabilities: Capability[] = [Capability.CodeGeneration, Capability.ContentGeneration]

    async execute(spec: TaskSpec): Promise<WorkerResult> {
        const diff = spec.inputs.parameters['diff']
        const context = spec.inputs.parameters['context']

        if (!diff || typeof diff !== 'string') {
            return this.createFailureResult('Missing or invalid "diff" parameter', spec)
        }

        if (!context || typeof context !== 'string') {
            return this.createFailureResult('Missing or invalid "context" parameter', spec)
        }

        if (spec.priority === 'low' && diff.length > 50000) {
            return this.createFailureResult('Budget constraint exceeded: diff too large for low priority', spec)
        }

        try {
            const lines = diff.split('\n')
            const added = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
            const removed = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length

            let type = 'chore'
            if (context.toLowerCase().includes('fix') || context.toLowerCase().includes('bug')) {
                type = 'fix'
            } else if (context.toLowerCase().includes('feat') || context.toLowerCase().includes('add')) {
                type = 'feat'
            }

            const summary = context.split('\n')[0]?.substring(0, 50).trim() || 'Update'
            const message = `${type}: ${summary}\n\n- Changes exactly: ${added} insertions, ${removed} deletions.`

            return {
                success: true,
                artifacts: [],
                output: message,
                usage: {
                    tokensUsed: Math.ceil(diff.length / 4 + context.length / 4),
                    toolCallsUsed: 0,
                    wallTimeElapsedSec: 0.8,
                    costUnitsUsed: 1
                }
            }

        } catch (err) {
            return this.createFailureResult(err instanceof Error ? err.message : 'Unknown generation error', spec)
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
