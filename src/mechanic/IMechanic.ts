import {
  BusinessId,
  BusinessType,
  BusinessUnit,
  ContainerProvisionRequest,
  ContainerProvisionResult,
  DatabaseProvisionRequest,
  DatabaseProvisionResult,
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

export interface IMechanic {
  provisionBusinessUnit(request: ProvisionBusinessUnitRequest): Promise<BusinessUnit>
  getBusinessUnit(businessId: BusinessId): Promise<BusinessUnit | null>
  listEvents(): Promise<SystemEvent[]>
}
