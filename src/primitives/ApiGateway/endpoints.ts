import { McpEndpoint } from '@shared/types'

export const ApiGatewayEndpoints: Record<string, McpEndpoint> = {
  proxyRequest: {
    name: 'ProxyExternalRequest',
    method: 'POST',
    path: '/api/v1/gateway/proxy',
    description: 'Rate-limited proxy for external API calls',
    requiredRole: ['orchestrator', 'worker', 'implementer'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        businessId: { type: 'string' },
        targetUrl: { type: 'string', format: 'uri' },
        method: { type: 'string' },
        headers: { type: 'object' },
        body: { type: 'string' },
        rateLimitPerMin: { type: 'number' },
      },
      required: ['businessId', 'targetUrl', 'method'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'number' },
        body: { type: 'string' },
      },
    },
  },
  getRateLimitUsage: {
    name: 'GetRateLimitUsage',
    method: 'GET',
    path: '/api/v1/gateway/usage',
    description: 'Get current minute rate-limit usage for a business',
    requiredRole: ['orchestrator', 'worker', 'implementer'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        businessId: { type: 'string' },
      },
      required: ['businessId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        windowStartMs: { type: 'number' },
      },
    },
  },
}
