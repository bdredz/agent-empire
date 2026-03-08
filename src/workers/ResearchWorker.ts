import type { IWorker, WorkerResult } from './IWorker'
import type { LlmProvider } from '@orchestrator/LlmGoalAnalyzer'
import { ModelTier, Capability } from '@shared/types'
import type { TaskSpec, BudgetUsage } from '@shared/types'
import { createChildLogger } from '@shared/logger'

const log = createChildLogger('research-worker')

/**
 * ResearchWorker — a concrete IWorker that sends task descriptions to an LLM
 * and returns the response as markdown output.
 */
export class ResearchWorker implements IWorker {
    readonly name = 'ResearchWorker'
    readonly modelTier = ModelTier.Standard
    readonly capabilities: Capability[] = [
        Capability.ContentGeneration,
        Capability.Summarization,
        Capability.DocRetrieval,
    ]

    constructor(private readonly llm: LlmProvider) { }

    async execute(spec: TaskSpec): Promise<WorkerResult> {
        const startTime = Date.now()

        try {
            const prompt = `You are an expert business researcher and strategist.

TASK: ${spec.inputs.parameters['description'] ?? spec.taskType}

Provide a thorough, actionable response in markdown format. Include:
- Key findings and analysis
- Specific recommendations with reasoning
- Potential risks or considerations
- Next steps

Be concrete and specific — avoid generic advice.`

            const system = 'You are a research and strategy agent within an autonomous AI system. Provide precise, actionable intelligence.'

            log.info({ taskId: spec.taskId, taskType: spec.taskType }, 'Executing research task')

            const response = await this.llm(prompt, system)

            const elapsedMs = Date.now() - startTime
            // Rough token estimation: ~4 chars per token
            const estimatedInputTokens = Math.ceil(prompt.length / 4)
            const estimatedOutputTokens = Math.ceil(response.length / 4)

            const usage: BudgetUsage = {
                tokensUsed: estimatedInputTokens + estimatedOutputTokens,
                toolCallsUsed: 1,
                wallTimeElapsedSec: elapsedMs / 1000,
                costUnitsUsed: (estimatedInputTokens * 0.003 + estimatedOutputTokens * 0.015) / 1000,
            }

            log.info({ taskId: spec.taskId, elapsedMs, estimatedOutputTokens }, 'Research task completed')

            return {
                success: true,
                artifacts: [],
                output: response,
                usage,
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            log.error({ taskId: spec.taskId, error: message }, 'Research task failed')

            return {
                success: false,
                artifacts: [],
                output: null,
                usage: {
                    tokensUsed: 0,
                    toolCallsUsed: 0,
                    wallTimeElapsedSec: (Date.now() - startTime) / 1000,
                    costUnitsUsed: 0,
                },
                errors: [message],
            }
        }
    }
}
