import { IWorker, WorkerResult } from './IWorker'
import { ModelTier, Capability, TaskSpec } from '@shared/types'

export class Summarizer implements IWorker {
    readonly name = 'Summarizer'
    readonly modelTier = ModelTier.Fast
    readonly capabilities: Capability[] = [Capability.Summarization]

    async execute(spec: TaskSpec): Promise<WorkerResult> {
        const text = spec.inputs.parameters['text']

        if (!text || typeof text !== 'string') {
            return this.createFailureResult('Missing or invalid "text" parameter', spec)
        }

        if (text.trim() === '') {
            return this.createFailureResult('Input "text" cannot be empty', spec)
        }

        // Heuristic for testing budget limits
        if (spec.priority === 'low' && text.length > 100000) {
            return this.createFailureResult('Budget constraint exceeded: text too long for low priority', spec)
        }

        try {
            // Stubbing the LLM call that would actually take place here
            // Real implementation would invoke the orchestrator or an internal proxy API
            // Since it requires Fast or Tiny tier, we simulate condensed bullets

            const sentences = text
                .split(/(?<=[.?!])\s+/)
                .map(s => s.trim())
                .filter(s => s.length > 5)

            // Take up to 3 sentences to form bullets
            const bullets = sentences.slice(0, 3).map(s => `- ${s}`)

            if (bullets.length === 0) {
                bullets.push('- No meaningful sentences to summarize.')
            }

            return {
                success: true,
                artifacts: [],
                output: bullets.join('\n'),
                usage: {
                    tokensUsed: text.length / 4, // roughly tokens
                    toolCallsUsed: 0,
                    wallTimeElapsedSec: 0.5,
                    costUnitsUsed: 1
                }
            }

        } catch (err) {
            return this.createFailureResult(err instanceof Error ? err.message : 'Unknown summarization error', spec)
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
