import { McpEndpoint } from '@shared/types'

export const WebhookManagerEndpoints: Record<string, McpEndpoint> = {
  registerWebhook: {
    name: 'RegisterWebhook',
    method: 'POST',
    path: '/api/v1/webhooks',
    description: 'Register a webhook endpoint for a business event',
    requiredRole: ['orchestrator', 'implementer', 'revenue_ops'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        businessId: { type: 'string' },
        eventType: { type: 'string' },
        targetUrl: { type: 'string', format: 'uri' },
        signingSecret: { type: 'string' },
      },
      required: ['businessId', 'eventType', 'targetUrl', 'signingSecret'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
    },
  },
  listWebhooks: {
    name: 'ListWebhooks',
    method: 'GET',
    path: '/api/v1/webhooks',
    description: 'List active webhook subscriptions for a business',
    requiredRole: ['orchestrator', 'implementer', 'revenue_ops'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: { businessId: { type: 'string' } },
      required: ['businessId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
      },
    },
  },
  dispatchWebhook: {
    name: 'DispatchWebhook',
    method: 'POST',
    path: '/api/v1/webhooks/dispatch',
    description: 'Dispatch an event payload to subscribed webhook targets',
    requiredRole: ['orchestrator', 'implementer'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        businessId: { type: 'string' },
        eventType: { type: 'string' },
        payload: { type: 'object' },
      },
      required: ['businessId', 'eventType', 'payload'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        delivered: { type: 'number' },
        failed: { type: 'number' },
      },
    },
  },
}
