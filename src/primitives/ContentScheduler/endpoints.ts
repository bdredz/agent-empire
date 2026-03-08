import { McpEndpoint } from '@shared/types'

export const ContentSchedulerEndpoints: Record<string, McpEndpoint> = {
    queueContent: {
        name: 'QueueContent',
        method: 'POST',
        path: '/api/v1/content/schedule',
        description: 'Queues content for future publication',
        requiredRole: ['marketer', 'orchestrator'], // Based on schema
        requiresApproval: true,
        inputSchema: {
            type: 'object',
            properties: {
                businessId: { type: 'string' },
                content: { type: 'string' },
                platforms: { type: 'array', items: { type: 'string' } },
                scheduledFor: { type: 'string', format: 'date-time' }
            },
            required: ['businessId', 'content', 'platforms', 'scheduledFor']
        },
        outputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                status: { type: 'string' }
            }
        }
    },
    listScheduledContent: {
        name: 'ListScheduledContent',
        method: 'GET',
        path: '/api/v1/content/schedule',
        description: 'Lists pending content',
        requiredRole: ['marketer', 'orchestrator'],
        requiresApproval: false,
        inputSchema: {
            type: 'object',
            properties: {
                businessId: { type: 'string' },
                status: { type: 'string' }
            },
            required: ['businessId']
        },
        outputSchema: {
            type: 'object',
            properties: {
                items: { type: 'array', items: { type: 'object' } }
            }
        }
    },
    cancelScheduledContent: {
        name: 'CancelScheduledContent',
        method: 'DELETE',
        path: '/api/v1/content/schedule/:id',
        description: 'Cancels scheduled content',
        requiredRole: ['marketer', 'orchestrator'],
        requiresApproval: false,
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string' }
            },
            required: ['id']
        },
        outputSchema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' }
            }
        }
    }
}
