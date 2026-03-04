import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  BusinessStatus,
  BusinessType,
  ContainerProvisionRequest,
  DatabaseProvisionRequest,
  EventType,
  RepoProvisionRequest,
  SandboxNetwork,
  createBusinessId,
} from '@shared/types'
import { DatabaseProvisioner } from '@mechanic/DatabaseProvisioner'
import { DockerProvisioner } from '@mechanic/DockerProvisioner'
import { Mechanic } from '@mechanic/Mechanic'
import { RepoProvisioner } from '@mechanic/RepoProvisioner'

const businessId = createBusinessId('business-1')

const containerRequest: ContainerProvisionRequest = {
  businessId,
  image: 'node:20-alpine',
  envVars: { NODE_ENV: 'production' },
  resourceLimits: { cpuShares: 256, memoryMb: 256, diskMb: 1024 },
  networkPolicy: SandboxNetwork.Restricted,
}

const databaseRequest: DatabaseProvisionRequest = {
  businessId,
  engine: 'postgresql',
  extensions: ['pgvector'],
  maxConnections: 20,
  maxSizeMb: 1024,
}

const repoRequest: RepoProvisionRequest = {
  businessId,
  repoName: 'agent-empire-business',
  isPrivate: true,
}

describe('DockerProvisioner', () => {
  it('creates and starts a container', async () => {
    const dockerClient = {
      createContainer: async () => ({
        id: 'container-1',
        start: async () => {},
        stop: async () => {},
        remove: async () => {},
        inspect: async () => ({
          State: { Status: 'running' },
          NetworkSettings: {
            Ports: {
              '3000/tcp': [{ HostPort: '3100' }],
            },
          },
        }),
      }),
      getContainer: () => {
        throw new Error('not used')
      },
    }

    const provisioner = new DockerProvisioner(dockerClient)
    const result = await provisioner.createContainer(containerRequest)

    expect(result.status).toBe('running')
    expect(result.containerId).toBe('container-1')
    expect(result.endpoints['3000/tcp']).toBe('http://localhost:3100')
  })

  it('returns failed when docker create fails', async () => {
    const provisioner = new DockerProvisioner({
      createContainer: async () => {
        throw new Error('docker failed')
      },
      getContainer: () => {
        throw new Error('not used')
      },
    })

    const result = await provisioner.createContainer(containerRequest)
    expect(result.status).toBe('failed')
  })

  it('supports start/stop/remove and status operations', async () => {
    let started = false
    let stopped = false
    let removed = false

    const container = {
      id: 'container-2',
      start: async () => {
        started = true
      },
      stop: async () => {
        stopped = true
      },
      remove: async () => {
        removed = true
      },
      inspect: async () => ({ State: { Status: 'running' } }),
    }

    const provisioner = new DockerProvisioner({
      createContainer: async () => container,
      getContainer: () => container,
    })

    await provisioner.startContainer('container-2')
    await provisioner.stopContainer('container-2')
    await provisioner.removeContainer('container-2')
    const status = await provisioner.getContainerStatus('container-2')

    expect(started).toBe(true)
    expect(stopped).toBe(true)
    expect(removed).toBe(true)
    expect(status).toBe('running')
  })

  it('returns not_found for missing container status checks', async () => {
    const provisioner = new DockerProvisioner({
      createContainer: async () => {
        throw new Error('not used')
      },
      getContainer: () => ({
        id: 'missing',
        start: async () => {},
        stop: async () => {},
        remove: async () => {},
        inspect: async () => {
          throw new Error('missing')
        },
      }),
    })

    await expect(provisioner.getContainerStatus('missing')).resolves.toBe('not_found')
  })

  it('rejects invalid container requests', async () => {
    const provisioner = new DockerProvisioner({
      createContainer: async () => {
        throw new Error('not used')
      },
      getContainer: () => {
        throw new Error('not used')
      },
    })

    await expect(
      provisioner.createContainer({ ...containerRequest, image: '' }),
    ).rejects.toThrow('Invalid container provision request')
  })
})

describe('DatabaseProvisioner', () => {
  it('provisions database and extensions', async () => {
    const statements: string[] = []
    const provisioner = new DatabaseProvisioner({
      execute: async (statement) => {
        statements.push(statement)
      },
    })

    const result = await provisioner.provisionDatabase(databaseRequest)

    expect(result.status).toBe('ready')
    expect(result.databaseName).toContain('business_')
    expect(statements).toEqual([
      `CREATE DATABASE ${result.databaseName}`,
      'CREATE EXTENSION IF NOT EXISTS pgvector',
    ])
  })

  it('returns failed when executor errors', async () => {
    const provisioner = new DatabaseProvisioner({
      execute: async () => {
        throw new Error('db failed')
      },
    })

    const result = await provisioner.provisionDatabase(databaseRequest)
    expect(result.status).toBe('failed')
  })

  it('rejects invalid database requests', async () => {
    const provisioner = new DatabaseProvisioner({ execute: async () => {} })

    const invalidRequest = { ...databaseRequest, engine: 'mysql' } as unknown as DatabaseProvisionRequest
    await expect(provisioner.provisionDatabase(invalidRequest)).rejects.toThrow(
      'Invalid database provision request',
    )
  })
})

describe('RepoProvisioner', () => {
  it('creates a private repo from request', async () => {
    const calls: Array<{ route: string; params: Record<string, unknown> }> = []
    const provisioner = new RepoProvisioner('agent-empire', {
      request: async (route, params) => {
        calls.push({ route, params })
        return {
          data: {
            html_url: 'https://github.com/agent-empire/new-repo',
            default_branch: 'main',
          },
        }
      },
    })

    const result = await provisioner.provisionRepo(repoRequest)

    expect(calls[0]?.route).toBe('POST /orgs/{org}/repos')
    expect(result.status).toBe('created')
    expect(result.repoUrl).toBe('https://github.com/agent-empire/new-repo')
  })

  it('returns failed when GitHub call fails', async () => {
    const provisioner = new RepoProvisioner('agent-empire', {
      request: async () => {
        throw new Error('github failed')
      },
    })

    const result = await provisioner.provisionRepo(repoRequest)
    expect(result.status).toBe('failed')
  })

  it('rejects non-private repos', async () => {
    const provisioner = new RepoProvisioner('agent-empire', {
      request: async () => ({ data: {} }),
    })

    const invalid = { ...repoRequest, isPrivate: false } as unknown as RepoProvisionRequest
    await expect(provisioner.provisionRepo(invalid)).rejects.toThrow('Invalid repo provision request')
  })
})

describe('Mechanic', () => {
  it('provisions a business unit via all provisioners', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'mechanic-state-'))
    const statePath = join(stateDir, 'state.json')

    const docker = new DockerProvisioner({
      createContainer: async () => ({
        id: 'container-9',
        start: async () => {},
        stop: async () => {},
        remove: async () => {},
        inspect: async () => ({ State: { Status: 'running' } }),
      }),
      getContainer: () => {
        throw new Error('not used')
      },
    })

    const db = new DatabaseProvisioner({ execute: async () => {} })
    const repo = new RepoProvisioner('agent-empire', {
      request: async () => ({
        data: { html_url: 'https://github.com/agent-empire/repo', default_branch: 'main' },
      }),
    })

    const mechanic = new Mechanic(docker, db, repo, statePath)

    const business = await mechanic.provisionBusinessUnit({
      businessId,
      name: 'Business Alpha',
      type: BusinessType.AgentApi,
      container: containerRequest,
      database: databaseRequest,
      repo: repoRequest,
    })

    expect(business.status).toBe(BusinessStatus.Active)
    expect(business.containerId).toBe('container-9')
    expect(await mechanic.getBusinessUnit(businessId)).toEqual(business)

    const events = await mechanic.listEvents()
    expect(events[0]?.eventType).toBe(EventType.BusinessProvisioned)

    rmSync(stateDir, { recursive: true, force: true })
  })

  it('returns null for missing business units', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'mechanic-state-'))
    const dockerStub = {
      createContainer: async () => ({
        containerId: '',
        status: 'running' as const,
        endpoints: {},
        provisionedAt: new Date().toISOString(),
      }),
      startContainer: async () => {},
      stopContainer: async () => {},
      removeContainer: async () => {},
      getContainerStatus: async () => 'running' as const,
    }
    const mechanic = new Mechanic(
      dockerStub,
      { provisionDatabase: async () => ({ connectionString: '', databaseName: '', status: 'ready' }) },
      { provisionRepo: async () => ({ repoUrl: '', defaultBranch: 'main', status: 'created' }) },
      join(stateDir, 'state.json'),
    )

    await expect(mechanic.getBusinessUnit(createBusinessId('missing-business'))).resolves.toBeNull()
    rmSync(stateDir, { recursive: true, force: true })
  })

  it('rejects invalid provision requests', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'mechanic-state-'))
    const dockerStub = {
      createContainer: async () => ({
        containerId: '',
        status: 'running' as const,
        endpoints: {},
        provisionedAt: new Date().toISOString(),
      }),
      startContainer: async () => {},
      stopContainer: async () => {},
      removeContainer: async () => {},
      getContainerStatus: async () => 'running' as const,
    }
    const mechanic = new Mechanic(
      dockerStub,
      { provisionDatabase: async () => ({ connectionString: '', databaseName: '', status: 'ready' }) },
      { provisionRepo: async () => ({ repoUrl: '', defaultBranch: 'main', status: 'created' }) },
      join(stateDir, 'state.json'),
    )

    const invalidRequest = {
      businessId,
      name: '',
      type: BusinessType.AgentApi,
      container: containerRequest,
      database: databaseRequest,
      repo: repoRequest,
    }

    await expect(mechanic.provisionBusinessUnit(invalidRequest)).rejects.toThrow(
      'Invalid business provision request',
    )
    rmSync(stateDir, { recursive: true, force: true })
  })
})
