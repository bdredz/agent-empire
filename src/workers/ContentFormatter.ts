import { IWorker, WorkerResult } from './IWorker'
import { ModelTier, Capability, TaskSpec } from '@shared/types'

export class ContentFormatter implements IWorker {
    readonly name = 'ContentFormatter'
    readonly modelTier = ModelTier.Tiny
    readonly capabilities: Capability[] = [Capability.ContentGeneration, Capability.DataTransform]

    async execute(spec: TaskSpec): Promise<WorkerResult> {
        const content = spec.inputs.parameters['content']
        const targetFormat = spec.inputs.parameters['targetFormat']

        if (typeof content !== 'string') {
            return this.createFailureResult('Missing or invalid "content" parameter', spec)
        }

        if (typeof targetFormat !== 'string') {
            return this.createFailureResult('Missing or invalid "targetFormat" parameter', spec)
        }

        if (!['markdown', 'html', 'json', 'text'].includes(targetFormat.toLowerCase())) {
            return this.createFailureResult('Unsupported "targetFormat". Must be markdown, html, json, or text', spec)
        }

        if (spec.priority === 'low' && content.length > 50000) {
            return this.createFailureResult('Budget constraint exceeded: content too large for low priority', spec)
        }

        try {
            let outputContent = content

            switch (targetFormat.toLowerCase()) {
                case 'json':
                    outputContent = JSON.stringify({ content: content.trim() })
                    break
                case 'html':
                    outputContent = content
                        .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')
                        .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n\n/g, '<br/>')
                    break
                case 'text':
                    outputContent = content
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/#/g, '')
                        .replace(/\*/g, '')
                        .replace(/\s+/g, ' ').trim()
                    break
                case 'markdown':
                    // assume it already came in as markdown or we do a basic pass
                    outputContent = content.trim()
                    break
            }

            return {
                success: true,
                artifacts: [],
                output: outputContent,
                usage: {
                    tokensUsed: Math.ceil(content.length / 4),
                    toolCallsUsed: 0,
                    wallTimeElapsedSec: 0.2,
                    costUnitsUsed: 1
                }
            }

        } catch (err) {
            return this.createFailureResult(err instanceof Error ? err.message : 'Unknown formatting error', spec)
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
