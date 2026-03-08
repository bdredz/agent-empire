import { z } from 'zod'
import {
  type CapabilityManifest,
  type ContainerProvisionRequest,
  type DatabaseProvisionRequest,
  type MechanicRequest,
  type RepoProvisionRequest,
  createBusinessId,
} from '@shared/types'
import type { IDatabaseProvisioner, IDockerProvisioner, IRepoProvisioner } from '@mechanic/IMechanic'
import { nanoid } from 'nanoid'

const containerPayloadSchema = z.union([
  z.object({ containerId: z.string().min(1) }),
  z.object({
    businessId: z.string().min(1),
    image: z.string().min(1),
    envVars: z.record(z.string(), z.string()),
    resourceLimits: z.object({
      cpuShares: z.number().int().positive(),
      memoryMb: z.number().int().positive(),
      diskMb: z.number().int().positive(),
    }),
    networkPolicy: z.enum(['none', 'restricted', 'full']),
  }),
])

const stopContainerPayloadSchema = z.object({ containerId: z.string().min(1) })

const databasePayloadSchema = z.object({
  businessId: z.string().min(1),
  engine: z.literal('postgresql'),
  extensions: z.array(z.string()),
  maxConnections: z.number().int().positive(),
  maxSizeMb: z.number().int().positive(),
})

const repoPayloadSchema = z.object({
  businessId: z.string().min(1),
  repoName: z.string().min(1),
  isPrivate: z.literal(true),
  templateRepo: z.string().optional(),
})

const generateManifestPayloadSchema = z.object({
  serviceName: z.string().min(1),
  version: z.string().min(1),
  baseUrl: z.string().url(),
  authScheme: z.enum(['api_key', 'a402', 'oauth', 'internal_only']).default('internal_only'),
  supportedOperations: z.array(z.string()).default([]),
})

const deployGatewayPayloadSchema = z.object({
  serviceName: z.string().min(1),
  baseUrl: z.string().url(),
})

export class MechanicActionExecutor {
  constructor(
    private readonly dockerProvisioner: IDockerProvisioner,
    private readonly databaseProvisioner: IDatabaseProvisioner,
    private readonly repoProvisioner: IRepoProvisioner,
  ) {}

  public async execute(request: MechanicRequest): Promise<Record<string, unknown>> {
    switch (request.action) {
      case 'start_container':
        return this.handleStartContainer(request)
      case 'stop_container':
        return this.handleStopContainer(request)
      case 'create_database':
        return this.handleCreateDatabase(request)
      case 'create_repo':
        return this.handleCreateRepo(request)
      case 'attach_network':
        return { status: 'accepted', action: request.action }
      case 'generate_manifest':
        return { status: 'accepted', manifest: this.buildManifestFromGeneratePayload(request) }
      case 'deploy_gateway':
        return { status: 'accepted', manifest: this.buildManifestFromDeployPayload(request) }
      default:
        throw new Error(`Unsupported mechanic action: ${request.action}`)
    }
  }

  private async handleStartContainer(request: MechanicRequest): Promise<Record<string, unknown>> {
    const payload = containerPayloadSchema.parse(request.payload)
    if ('containerId' in payload) {
      await this.dockerProvisioner.startContainer(payload.containerId)
      return { containerId: payload.containerId, status: 'running' }
    }

    const createRequest = {
      ...payload,
      businessId: createBusinessId(payload.businessId),
    } satisfies ContainerProvisionRequest

    const result = await this.dockerProvisioner.createContainer(createRequest)
    if (result.status !== 'running') {
      throw new Error('Container provisioning failed')
    }

    return {
      containerId: result.containerId,
      status: result.status,
      endpoints: result.endpoints,
    }
  }

  private async handleStopContainer(request: MechanicRequest): Promise<Record<string, unknown>> {
    const payload = stopContainerPayloadSchema.parse(request.payload)
    await this.dockerProvisioner.stopContainer(payload.containerId)
    return { containerId: payload.containerId, status: 'stopped' }
  }

  private async handleCreateDatabase(request: MechanicRequest): Promise<Record<string, unknown>> {
    const payload = databasePayloadSchema.parse(request.payload)
    const dbRequest = {
      ...payload,
      businessId: createBusinessId(payload.businessId),
    } satisfies DatabaseProvisionRequest

    const result = await this.databaseProvisioner.provisionDatabase(dbRequest)
    if (result.status !== 'ready') {
      throw new Error('Database provisioning failed')
    }

    return {
      status: result.status,
      databaseName: result.databaseName,
      connectionString: result.connectionString,
    }
  }

  private async handleCreateRepo(request: MechanicRequest): Promise<Record<string, unknown>> {
    const payload = repoPayloadSchema.parse(request.payload)
    const repoRequest = {
      ...payload,
      businessId: createBusinessId(payload.businessId),
    } satisfies RepoProvisionRequest

    const result = await this.repoProvisioner.provisionRepo(repoRequest)
    if (result.status !== 'created') {
      throw new Error('Repository provisioning failed')
    }

    return {
      status: result.status,
      repoUrl: result.repoUrl,
      defaultBranch: result.defaultBranch,
    }
  }

  private buildManifestFromGeneratePayload(request: MechanicRequest): CapabilityManifest {
    const payload = generateManifestPayloadSchema.parse(request.payload)
    return {
      manifestId: `manifest-${nanoid()}`,
      tenantId: request.tenantId,
      businessUnitId: request.businessUnitId,
      serviceName: payload.serviceName,
      version: payload.version,
      baseUrl: payload.baseUrl,
      authScheme: payload.authScheme,
      supportedOperations: payload.supportedOperations,
      createdAt: new Date().toISOString(),
    }
  }

  private buildManifestFromDeployPayload(request: MechanicRequest): CapabilityManifest {
    const payload = deployGatewayPayloadSchema.parse(request.payload)
    return {
      manifestId: `manifest-${nanoid()}`,
      tenantId: request.tenantId,
      businessUnitId: request.businessUnitId,
      serviceName: payload.serviceName,
      version: '1.0.0',
      baseUrl: payload.baseUrl,
      authScheme: 'internal_only',
      supportedOperations: ['invoke'],
      healthcheckUrl: `${payload.baseUrl}/health`,
      createdAt: new Date().toISOString(),
    }
  }
}
