import { McpEndpoint } from '@shared/types'

export const LeadTrackerEndpoints: Record<string, McpEndpoint> = {
  createLead: {
    name: 'CreateLead',
    method: 'POST',
    path: '/api/v1/leads',
    description: 'Create a new lead in the pipeline',
    requiredRole: ['revenue_ops', 'marketer', 'orchestrator'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        businessId: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        company: { type: 'string' },
      },
      required: ['businessId', 'name', 'email'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
      },
    },
  },
  listLeads: {
    name: 'ListLeads',
    method: 'GET',
    path: '/api/v1/leads',
    description: 'List leads for a business, optionally filtered by status',
    requiredRole: ['revenue_ops', 'marketer', 'orchestrator'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        businessId: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['businessId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
      },
    },
  },
  updateLeadStatus: {
    name: 'UpdateLeadStatus',
    method: 'PUT',
    path: '/api/v1/leads/:id/status',
    description: 'Update lead status in pipeline',
    requiredRole: ['revenue_ops', 'orchestrator'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['id', 'status'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
      },
    },
  },
  deleteLead: {
    name: 'DeleteLead',
    method: 'DELETE',
    path: '/api/v1/leads/:id',
    description: 'Delete a lead record',
    requiredRole: ['revenue_ops', 'orchestrator'],
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  },
}
