import {
  BusinessId,
  BusinessType,
  BusinessUnit,
  ContainerProvisionRequest,
  ContainerProvisionResult,
  DatabaseProvisionRequest,
  DatabaseProvisionResult,
  MechanicAction,
  MechanicRequest,
  RepoProvisionRequest,
  RepoProvisionResult,
  SystemEvent,
} from '@shared/types'

export type ContainerRuntimeStatus =
  | 'created'
  | 'running'
  | 'paused'
  | 'exited'
  | 'not_found'
  | 'failed'

export interface IDockerProvisioner {
  createContainer(request: ContainerProvisionRequest): Promise<ContainerProvisionResult>
  startContainer(containerId: string): Promise<void>
  stopContainer(containerId: string): Promise<void>
  removeContainer(containerId: string): Promise<void>
  getContainerStatus(containerId: string): Promise<ContainerRuntimeStatus>
}

export interface IDatabaseProvisioner {
  provisionDatabase(request: DatabaseProvisionRequest): Promise<DatabaseProvisionResult>
}

export interface IRepoProvisioner {
  provisionRepo(request: RepoProvisionRequest): Promise<RepoProvisionResult>
}

export interface ProvisionBusinessUnitRequest {
  readonly businessId: BusinessId
  readonly name: string
  readonly type: BusinessType
  readonly container: ContainerProvisionRequest
  readonly database: DatabaseProvisionRequest
  readonly repo: RepoProvisionRequest
}

export interface MechanicActionResult {
  readonly requestId: string
  readonly action: MechanicAction
  readonly status: 'executed' | 'rejected'
  readonly message: string
  readonly data?: Record<string, unknown>
}

export interface IMechanic {
  executeRequest(request: MechanicRequest): Promise<MechanicActionResult>
  provisionBusinessUnit(request: ProvisionBusinessUnitRequest): Promise<BusinessUnit>
  getBusinessUnit(businessId: BusinessId): Promise<BusinessUnit | null>
  listEvents(): Promise<SystemEvent[]>
}
