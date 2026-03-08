import Docker from 'dockerode'
import { z } from 'zod'
import {
  ContainerProvisionRequest,
  ContainerProvisionResult,
  SandboxNetwork,
} from '@shared/types'
import { ContainerRuntimeStatus, IDockerProvisioner } from '@mechanic/IMechanic'

interface DockerInspectInfo {
  State?: { Status?: string }
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostPort?: string }> | undefined>
  }
}

interface DockerContainer {
  readonly id: string
  start(): Promise<void>
  stop(): Promise<void>
  remove(options?: { force?: boolean }): Promise<void>
  inspect(): Promise<DockerInspectInfo>
}

interface DockerClient {
  createContainer(options: {
    Image: string
    Env: string[]
    HostConfig: { CpuShares: number; Memory: number }
    Labels: Record<string, string>
  }): Promise<DockerContainer>
  getContainer(containerId: string): DockerContainer
}

const containerRequestSchema = z.object({
  businessId: z.string().min(1),
  image: z.string().min(1),
  envVars: z.record(z.string(), z.string()),
  resourceLimits: z.object({
    cpuShares: z.number().int().positive(),
    memoryMb: z.number().int().positive(),
    diskMb: z.number().int().positive(),
  }),
  networkPolicy: z.nativeEnum(SandboxNetwork),
})

const allowedStatuses: ReadonlySet<string> = new Set(['created', 'running', 'paused', 'exited'])

export class DockerProvisioner implements IDockerProvisioner {
  constructor(private readonly docker: DockerClient = new Docker()) {}

  public async createContainer(request: ContainerProvisionRequest): Promise<ContainerProvisionResult> {
    this.validateRequest(request)

    try {
      const container = await this.docker.createContainer({
        Image: request.image,
        Env: Object.entries(request.envVars).map(([key, value]) => `${key}=${value}`),
        HostConfig: {
          CpuShares: request.resourceLimits.cpuShares,
          Memory: request.resourceLimits.memoryMb * 1024 * 1024,
        },
        Labels: {
          businessId: request.businessId as string,
          networkPolicy: request.networkPolicy,
          diskMb: String(request.resourceLimits.diskMb),
        },
      })

      await container.start()
      const inspect = await container.inspect()

      return {
        containerId: container.id,
        status: 'running',
        endpoints: this.extractEndpoints(inspect),
        provisionedAt: new Date().toISOString(),
      }
    } catch {
      return {
        containerId: 'failed',
        status: 'failed',
        endpoints: {},
        provisionedAt: new Date().toISOString(),
      }
    }
  }

  public async startContainer(containerId: string): Promise<void> {
    await this.docker.getContainer(containerId).start()
  }

  public async stopContainer(containerId: string): Promise<void> {
    await this.docker.getContainer(containerId).stop()
  }

  public async removeContainer(containerId: string): Promise<void> {
    await this.docker.getContainer(containerId).remove({ force: true })
  }

  public async getContainerStatus(containerId: string): Promise<ContainerRuntimeStatus> {
    try {
      const inspect = await this.docker.getContainer(containerId).inspect()
      const rawStatus = inspect.State?.Status
      if (rawStatus && allowedStatuses.has(rawStatus)) {
        return rawStatus as ContainerRuntimeStatus
      }
      return 'failed'
    } catch {
      return 'not_found'
    }
  }

  private validateRequest(request: ContainerProvisionRequest): void {
    const parsed = containerRequestSchema.safeParse(request)
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      throw new Error(`Invalid container provision request: ${details}`)
    }
  }

  private extractEndpoints(inspect: DockerInspectInfo): Record<string, string> {
    const ports = inspect.NetworkSettings?.Ports ?? {}
    return Object.entries(ports).reduce<Record<string, string>>((acc, [containerPort, bindings]) => {
      const hostPort = bindings?.[0]?.HostPort
      if (hostPort) {
        acc[containerPort] = `http://localhost:${hostPort}`
      }
      return acc
    }, {})
  }
}
