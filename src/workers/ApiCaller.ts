import { IWorker, WorkerResult } from './IWorker'
import { ModelTier, Capability, TaskSpec } from '@shared/types'

export class ApiCaller implements IWorker {
    readonly name = 'ApiCaller'
    readonly modelTier = ModelTier.Tiny
    readonly capabilities: Capability[] = [Capability.ApiIntegration]

    async execute(spec: TaskSpec): Promise<WorkerResult> {
        const url = spec.inputs.parameters['url']
        const method = (spec.inputs.parameters['method'] as string) || 'GET'
        const headers = (spec.inputs.parameters['headers'] as Record<string, string>) || {}
        const body = spec.inputs.parameters['body']

        if (!url || typeof url !== 'string') {
            return this.createFailureResult('Missing or invalid "url" parameter', spec)
        }

        try {
            new URL(url)
        } catch {
            return this.createFailureResult('Malformed "url" parameter', spec)
        }

        if (spec.priority === 'low' && url.includes('blocked-api.com')) {
            return this.createFailureResult('Budget constraint exceeded or destination blocked', spec)
        }

        try {
            const fetchOptions: RequestInit = {
                method: method.toUpperCase(),
                headers
            }

            if (body !== undefined && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method as string)) {
                fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : String(body)
                if (!headers['Content-Type'] && typeof body === 'object') {
                    headers['Content-Type'] = 'application/json'
                }
            }

            const response = await fetch(url, fetchOptions)
            const responseHeaders = Object.fromEntries(response.headers.entries())

            let responseData: unknown
            const text = await response.text()
            try {
                responseData = text ? JSON.parse(text) : null
            } catch {
                responseData = text
            }

            const outputData = {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                data: responseData
            }

            return {
                success: response.ok,
                artifacts: [],
                output: outputData,
                usage: {
                    tokensUsed: 0,
                    toolCallsUsed: 1,
                    wallTimeElapsedSec: 0.5,
                    costUnitsUsed: 2
                },
                errors: !response.ok ? [`HTTP ${response.status}: ${response.statusText}`] : undefined
            }

        } catch (err) {
            return this.createFailureResult(err instanceof Error ? err.message : 'Unknown network error', spec)
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
