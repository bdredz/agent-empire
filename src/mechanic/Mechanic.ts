import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  BusinessId,
  BusinessStatus,
  BusinessUnit,
  EventType,
  SystemEvent,
} from '@shared/types'
import {
  IDatabaseProvisioner,
  IDockerProvisioner,
  IMechanic,
  IRepoProvisioner,
  ProvisionBusinessUnitRequest,
} from '@mechanic/IMechanic'

interface MechanicState {
  businesses: Record<string, BusinessUnit>
  events: SystemEvent[]
}

const DEFAULT_STATE_FILE = '.data/mechanic-state.json'

const provisionRequestSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  container: z.object({
    businessId: z.string().min(1),
    image: z.string().min(1),
  }),
  database: z.object({
    businessId: z.string().min(1),
    engine: z.literal('postgresql'),
  }),
  repo: z.object({
    businessId: z.string().min(1),
    repoName: z.string().min(1),
    isPrivate: z.literal(true),
  }),
})

export class Mechanic implements IMechanic {
  private readonly stateFilePath: string

  constructor(
    private readonly dockerProvisioner: IDockerProvisioner,
    private readonly databaseProvisioner: IDatabaseProvisioner,
    private readonly repoProvisioner: IRepoProvisioner,
    stateFilePath?: string,
  ) {
    this.stateFilePath = stateFilePath ?? process.env.MECHANIC_STATE_FILE ?? DEFAULT_STATE_FILE
  }

  public async provisionBusinessUnit(request: ProvisionBusinessUnitRequest): Promise<BusinessUnit> {
    this.validateProvisionRequest(request)

    const state = this.readState()
    const key = request.businessId as string
    const existing = state.businesses[key]
    if (existing) {
      return existing
    }

    const database = await this.databaseProvisioner.provisionDatabase(request.database)
    if (database.status !== 'ready') {
      throw new Error('Database provisioning failed')
    }

    const repo = await this.repoProvisioner.provisionRepo(request.repo)
    if (repo.status !== 'created') {
      throw new Error('Repository provisioning failed')
    }

    const container = await this.dockerProvisioner.createContainer(request.container)
    if (container.status !== 'running') {
      throw new Error('Container provisioning failed')
    }

    const businessUnit: BusinessUnit = {
      businessId: request.businessId,
      name: request.name,
      type: request.type,
      status: BusinessStatus.Active,
      containerId: container.containerId,
      repoUrl: repo.repoUrl,
      assignedAgents: [],
      createdAt: new Date().toISOString(),
      metrics: {
        revenue30d: 0,
        costs30d: 0,
        activeAgents: 0,
        totalTasksCompleted: 0,
        failureRate: 0,
        uptimePercent: 100,
      },
    }

    state.businesses[key] = businessUnit
    state.events.push(this.createEvent(request.businessId, EventType.BusinessProvisioned, {
      containerId: container.containerId,
      repoUrl: repo.repoUrl,
      databaseName: database.databaseName,
    }))

    this.writeState(state)
    return businessUnit
  }

  public async getBusinessUnit(businessId: BusinessId): Promise<BusinessUnit | null> {
    const state = this.readState()
    return state.businesses[businessId as string] ?? null
  }

  public async listEvents(): Promise<SystemEvent[]> {
    return this.readState().events
  }

  private validateProvisionRequest(request: ProvisionBusinessUnitRequest): void {
    const parsed = provisionRequestSchema.safeParse(request)
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      throw new Error(`Invalid business provision request: ${details}`)
    }
  }

  private createEvent(businessId: BusinessId, eventType: EventType, payload: Record<string, unknown>): SystemEvent {
    return {
      eventId: `${businessId as string}:${eventType}:${Date.now()}`,
      eventType,
      timestamp: new Date().toISOString(),
      businessId,
      payload,
      severity: 'info',
    }
  }

  private readState(): MechanicState {
    if (!existsSync(this.stateFilePath)) {
      return { businesses: {}, events: [] }
    }

    return JSON.parse(readFileSync(this.stateFilePath, 'utf-8')) as MechanicState
  }

  private writeState(state: MechanicState): void {
    mkdirSync(dirname(this.stateFilePath), { recursive: true })
    writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8')
  }
}
