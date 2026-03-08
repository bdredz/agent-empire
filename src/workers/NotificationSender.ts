import { IWorker, WorkerResult } from './IWorker'
import { ModelTier, Capability, TaskSpec } from '@shared/types'

export class NotificationSender implements IWorker {
    readonly name = 'NotificationSender'
    readonly modelTier = ModelTier.Tiny
    readonly capabilities: Capability[] = [Capability.HumanOutreach]

    async execute(spec: TaskSpec): Promise<WorkerResult> {
        const message = spec.inputs.parameters['message']
        const channel = spec.inputs.parameters['channel']

        if (!message || typeof message !== 'string') {
            return this.createFailureResult('Missing or invalid "message" parameter', spec)
        }

        if (!channel || typeof channel !== 'string') {
            return this.createFailureResult('Missing or invalid "channel" parameter', spec)
        }

        if (spec.priority === 'low' && channel.toLowerCase() === 'sms') {
            return this.createFailureResult('Budget constraint exceeded: SMS not allowed for low priority', spec)
        }

        const permittedChannels = ['slack', 'discord', 'email', 'sms']
        if (!permittedChannels.includes(channel.toLowerCase())) {
            return this.createFailureResult(`Unknown channel: ${channel}`, spec)
        }

        try {
            // Stub integration to actual channels
            const timestamp = new Date().toISOString()
            const outputData = {
                dispatchedAt: timestamp,
                channel: channel.toLowerCase(),
                messageSnippet: message.substring(0, 50),
                status: 'delivered'
            }

            return {
                success: true,
                artifacts: [],
                output: outputData,
                usage: {
                    tokensUsed: Math.ceil(message.length / 4),
                    toolCallsUsed: 1,
                    wallTimeElapsedSec: 0.3,
                    costUnitsUsed: channel.toLowerCase() === 'sms' ? 5 : 1
                }
            }

        } catch (err) {
            return this.createFailureResult(err instanceof Error ? err.message : 'Unknown notification error', spec)
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
