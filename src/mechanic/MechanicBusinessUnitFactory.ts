import { type BusinessUnit, BusinessStatus } from '@shared/types'
import type { ProvisionBusinessUnitRequest } from '@mechanic/IMechanic'

export function buildBusinessUnit(
  request: ProvisionBusinessUnitRequest,
  containerData: Record<string, unknown>,
  repoData: Record<string, unknown>,
): BusinessUnit {
  return {
    businessId: request.businessId,
    name: request.name,
    type: request.type,
    status: BusinessStatus.Active,
    containerId: getRequiredString(containerData, 'containerId'),
    repoUrl: getRequiredString(repoData, 'repoUrl'),
    assignedAgents: [],
    createdAt: new Date().toISOString(),
    metrics: { revenue30d: 0, costs30d: 0, activeAgents: 0, totalTasksCompleted: 0, failureRate: 0, uptimePercent: 100 },
  }
}

export function getRequiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing required result field: ${key}`)
  return value
}
