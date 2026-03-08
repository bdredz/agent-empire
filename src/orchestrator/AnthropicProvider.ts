import { getConfig } from '@shared/config'
import type { LlmProvider } from './LlmGoalAnalyzer'

/**
 * Concrete implementation of LlmProvider using Anthropic's Messages API via fetch.
 * This avoids a direct dependency on the @anthropic-ai/sdk if it's not installed.
 */
export const createAnthropicProvider = (): LlmProvider => {
    return async (prompt: string, system: string): Promise<string> => {
        const config = getConfig()
        const apiKey = config.anthropicApiKey

        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not set in configuration')
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 4096,
                system,
                messages: [
                    { role: 'user', content: prompt }
                ],
            }),
        })

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`Anthropic API error (${response.status}): ${error}`)
        }

        const data = await response.json()
        return data.content[0].text
    }
}
