import { z } from 'zod'
import {
  type CapabilityManifest,
  type BusinessId,
  type BusinessUnit,
  type MechanicAction,
  type MechanicRequest,
  type SystemEvent,
  EventType,
} from '@shared/types'
import {
  type IDatabaseProvisioner,
  type IDockerProvisioner,
  type IRepoProvisioner,
  type MechanicActionResult,
  type ProvisionBusinessUnitRequest,
  IMechanic,
} from '@mechanic/IMechanic'
import { ActionPolicy } from '@mechanic/ActionPolicy'
import { MechanicRequestValidator } from '@mechanic/MechanicRequestValidator'
import { MechanicAuditLog } from '@mechanic/MechanicAuditLog'
import { MechanicActionExecutor } from '@mechanic/MechanicActionExecutor'
import { MechanicStateStore } from '@mechanic/MechanicStateStore'
import { CapabilityManifestWriter } from '@librarian/CapabilityManifestWriter'
import { InternalRegistry } from '@librarian/InternalRegistry'
import { buildBusinessUnit, getRequiredString } from '@mechanic/MechanicBusinessUnitFactory'
const DEFAULT_STATE_FILE = '.data/mechanic-state.json'
const provisionRequestSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  container: z.object({ businessId: z.string().min(1), image: z.string().min(1) }),
  database: z.object({ businessId: z.string().min(1), engine: z.literal('postgresql') }),
  repo: z.object({ businessId: z.string().min(1), repoName: z.string().min(1), isPrivate: z.literal(true) }),
})
export class Mechanic implements IMechanic {
  private readonly actionExecutor: MechanicActionExecutor
  private readonly stateStore: MechanicStateStore

  constructor(
    dockerProvisioner: IDockerProvisioner,
    databaseProvisioner: IDatabaseProvisioner,
    repoProvisioner: IRepoProvisioner,
    stateFilePath?: string,
    private readonly actionPolicy: ActionPolicy = new ActionPolicy(),
    private readonly requestValidator: MechanicRequestValidator = new MechanicRequestValidator(),
    private readonly auditLog: MechanicAuditLog = new MechanicAuditLog(),
    private readonly manifestWriter?: CapabilityManifestWriter,
    private readonly internalRegistry?: InternalRegistry,
  ) {
    this.actionExecutor = new MechanicActionExecutor(dockerProvisioner, databaseProvisioner, repoProvisioner)
    this.stateStore = new MechanicStateStore(stateFilePath ?? process.env.MECHANIC_STATE_FILE ?? DEFAULT_STATE_FILE)
  }
  public async executeRequest(request: MechanicRequest): Promise<MechanicActionResult> {
    const policyDecision = this.actionPolicy.evaluate(request.action)
    if (!policyDecision.allowed) {
      return this.rejectRequest(request, policyDecision.reason ?? 'Action rejected by policy')
    }

    const validation = this.requestValidator.validate(request)
    if (!validation.valid) {
      return this.rejectRequest(request, validation.reason)
    }
    await this.recordAudit(request, 'accepted')

    try {
      const data = await this.actionExecutor.execute(validation.request)
      await this.emitManifestIfPresent(data)
      await this.recordAudit(request, 'executed')
      return this.buildResult(request, 'executed', 'Action executed', data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown mechanic execution error'
      await this.recordAudit(request, 'failed', message)
      return this.buildResult(request, 'rejected', message)
    }
  }
  public async provisionBusinessUnit(request: ProvisionBusinessUnitRequest): Promise<BusinessUnit> {
    this.validateProvisionRequest(request)
    const state = this.stateStore.read()
    const key = request.businessId as string
    const existing = state.businesses[key]
    if (existing) return existing

    const databaseData = await this.executeOrThrow(request.businessId, 'create_database', { ...request.database })
    const repoData = await this.executeOrThrow(request.businessId, 'create_repo', { ...request.repo })
    const containerData = await this.executeOrThrow(request.businessId, 'start_container', { ...request.container })

    const businessUnit = buildBusinessUnit(request, containerData, repoData)
    state.businesses[key] = businessUnit
    state.events.push(this.createProvisionedEvent(request.businessId, businessUnit, databaseData))

    this.stateStore.write(state)
    return businessUnit
  }

  public async getBusinessUnit(businessId: BusinessId): Promise<BusinessUnit | null> {
    return this.stateStore.read().businesses[businessId as string] ?? null
  }

  public async listEvents(): Promise<SystemEvent[]> {
    return this.stateStore.read().events
  }

  private async executeOrThrow(
    businessId: BusinessId,
    action: MechanicAction,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await this.executeRequest(this.buildRequest(businessId, action, payload))
    if (result.status !== 'executed') throw new Error(`${action} rejected: ${result.message}`)
    return result.data ?? {}
  }

  private buildRequest(businessId: BusinessId, action: MechanicAction, payload: Record<string, unknown>): MechanicRequest {
    const businessUnitId = businessId as string
    return {
      requestId: `${businessUnitId}:${action}:${Date.now()}`,
      tenantId: 'default-tenant',
      businessUnitId,
      action,
      payload: { ...payload, businessId: businessUnitId },
      approvedByPlanId: `plan:${businessUnitId}`,
      requestedByAgentId: 'jarvis',
    }
  }

  private validateProvisionRequest(request: ProvisionBusinessUnitRequest): void {
    const parsed = provisionRequestSchema.safeParse(request)
    if (parsed.success) return
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid business provision request: ${details}`)
  }

  private createProvisionedEvent(
    businessId: BusinessId,
    businessUnit: BusinessUnit,
    databaseData: Record<string, unknown>,
  ): SystemEvent {
    return {
      eventId: `${businessId as string}:${EventType.BusinessProvisioned}:${Date.now()}`,
      eventType: EventType.BusinessProvisioned,
      timestamp: new Date().toISOString(),
      businessId,
      payload: {
        containerId: businessUnit.containerId,
        repoUrl: businessUnit.repoUrl,
        databaseName: getRequiredString(databaseData, 'databaseName'),
      },
      severity: 'info',
    }
  }

  private async rejectRequest(request: MechanicRequest, message: string): Promise<MechanicActionResult> {
    await this.recordAudit(request, 'rejected', message)
    return this.buildResult(request, 'rejected', message)
  }

  private buildResult(
    request: MechanicRequest,
    status: 'executed' | 'rejected',
    message: string,
    data?: Record<string, unknown>,
  ): MechanicActionResult {
    return { requestId: request.requestId, action: request.action, status, message, data }
  }

  private async recordAudit(
    request: MechanicRequest,
    status: 'accepted' | 'rejected' | 'executed' | 'failed',
    reason?: string,
  ): Promise<void> {
    await this.auditLog.record({
      requestId: request.requestId,
      tenantId: request.tenantId,
      businessUnitId: request.businessUnitId,
      action: request.action,
      status,
      reason,
      timestamp: new Date().toISOString(),
    })
  }

  private async emitManifestIfPresent(data: Record<string, unknown>): Promise<void> {
    const manifest = data.manifest as CapabilityManifest | undefined
    if (!manifest) return
    if (this.internalRegistry) this.internalRegistry.upsert(manifest)
    if (this.manifestWriter) await this.manifestWriter.write(manifest)
  }
}
