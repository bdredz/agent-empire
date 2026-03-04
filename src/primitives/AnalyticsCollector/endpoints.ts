import { McpEndpoint } from '@shared/types'

export const AnalyticsCollectorEndpoints: Record<string, McpEndpoint> = {
    trackEvent: {
        name: 'TrackEvent',
        method: 'POST',
        path: '/api/v1/analytics/events',
        description: 'Tracks an analytics event',
        requiredRole: ['orchestrator', 'marketer', 'revenue_ops'],
        requiresApproval: false,
        inputSchema: {
            type: 'object',
            properties: {
                businessId: { type: 'string' },
                eventName: { type: 'string' },
                properties: { type: 'object' },
                numericValue: { type: 'number' },
                userId: { type: 'string' }
            },
            required: ['businessId', 'eventName']
        },
        outputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string' }
            }
        }
    },
    queryEvents: {
        name: 'QueryEvents',
        method: 'GET',
        path: '/api/v1/analytics/events',
        description: 'Queries recent events',
        requiredRole: ['orchestrator', 'marketer', 'revenue_ops'],
        requiresApproval: false,
        inputSchema: {
            type: 'object',
            properties: {
                businessId: { type: 'string' },
                eventName: { type: 'string' },
                limit: { type: 'number' }
            },
            required: ['businessId']
        },
        outputSchema: {
            type: 'object',
            properties: {
                items: { type: 'array', items: { type: 'object' } }
            }
        }
    }
}
