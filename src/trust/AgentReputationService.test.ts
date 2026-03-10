import { describe, expect, it } from 'vitest'
import { AgentId, AgentIdentity, createAgentId } from '@shared/types'
import { IAgentIdentityService } from './IAgentIdentityService'
import { AgentReputationService } from './AgentReputationService'

class StubIdentityService implements IAgentIdentityService {
  private readonly known = new Set<AgentId>()

  constructor(agentIds: AgentId[]) {
    for (const id of agentIds) {
      this.known.add(id)
    }
  }

  public async issue(): Promise<AgentIdentity> {
    throw new Error('issue not supported in stub')
  }

  public async get(agentId: AgentId): Promise<AgentIdentity | null> {
    if (!this.known.has(agentId)) {
      return null
    }

    return makeIdentity(agentId)
  }

  public async verify(agentId: AgentId): Promise<AgentIdentity> {
    return makeIdentity(agentId)
  }

  public async restrict(agentId: AgentId): Promise<AgentIdentity> {
    return makeIdentity(agentId)
  }

  public async revoke(agentId: AgentId): Promise<AgentIdentity> {
    return makeIdentity(agentId)
  }

  public async bindWallet(agentId: AgentId): Promise<AgentIdentity> {
    return makeIdentity(agentId)
  }

  public async listByTenant(): Promise<AgentIdentity[]> {
    return []
  }
}

function makeIdentity(agentId: AgentId): AgentIdentity {
  return {
    agentId,
    tenantId: 'tenant-1',
    ownerType: 'system',
    ownerId: 'owner',
    role: 'worker',
    verificationStatus: 'verified',
    walletBindings: [],
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
  }
}

describe('AgentReputationService', () => {
  it('records success event', async () => {
    const agentId = createAgentId('agent-1')
    const service = new AgentReputationService(
      new StubIdentityService([agentId]),
    )

    const report = await service.recordEvent(agentId, 'task_completed')

    expect(report.successRate).toBe(1)
  })

  it('records failure event', async () => {
    const agentId = createAgentId('agent-2')
    const service = new AgentReputationService(
      new StubIdentityService([agentId]),
    )

    const report = await service.recordEvent(agentId, 'task_failed')

    expect(report.successRate).toBe(0)
  })

  it('computes score for mixed task outcomes', async () => {
    const agentId = createAgentId('agent-3')
    const service = new AgentReputationService(
      new StubIdentityService([agentId]),
    )

    await service.recordEvent(agentId, 'task_completed')
    await service.recordEvent(agentId, 'task_failed')
    const report = await service.getReport(agentId)

    expect(report.score).toBeLessThan(100)
    expect(report.score).toBeGreaterThan(0)
  })

  it('applies refund penalty', async () => {
    const agentId = createAgentId('agent-4')
    const service = new AgentReputationService(
      new StubIdentityService([agentId]),
    )

    await service.recordEvent(agentId, 'task_completed')
    const before = await service.getReport(agentId)
    await service.recordEvent(agentId, 'refund_issued')
    const after = await service.getReport(agentId)

    expect(after.score).toBeLessThan(before.score)
  })

  it('applies dispute penalty', async () => {
    const agentId = createAgentId('agent-5')
    const service = new AgentReputationService(
      new StubIdentityService([agentId]),
    )

    await service.recordEvent(agentId, 'task_completed')
    const before = await service.getReport(agentId)
    await service.recordEvent(agentId, 'dispute_filed')
    const after = await service.getReport(agentId)

    expect(after.score).toBeLessThan(before.score)
  })

  it('applies policy violation penalty', async () => {
    const agentId = createAgentId('agent-6')
    const service = new AgentReputationService(
      new StubIdentityService([agentId]),
    )

    await service.recordEvent(agentId, 'task_completed')
    const before = await service.getReport(agentId)
    await service.recordEvent(agentId, 'policy_violation')
    const after = await service.getReport(agentId)

    expect(after.score).toBeLessThan(before.score)
  })

  it('applies score decay over time', async () => {
    const agentId = createAgentId('agent-7')
    let now = new Date('2026-03-10T00:00:00.000Z')
    const service = new AgentReputationService(
      new StubIdentityService([agentId]),
      {
        now: () => now,
      },
    )

    await service.recordEvent(agentId, 'task_completed')
    const current = await service.getReport(agentId)

    now = new Date('2026-03-20T00:00:00.000Z')
    const decayed = await service.getReport(agentId)

    expect(decayed.score).toBeLessThan(current.score)
  })

  it('keeps multiple agent records independent', async () => {
    const firstAgent = createAgentId('agent-8')
    const secondAgent = createAgentId('agent-9')
    const service = new AgentReputationService(
      new StubIdentityService([firstAgent, secondAgent]),
    )

    await service.recordEvent(firstAgent, 'task_failed')
    await service.recordEvent(secondAgent, 'task_completed')

    const firstReport = await service.getReport(firstAgent)
    const secondReport = await service.getReport(secondAgent)

    expect(firstReport.score).toBeLessThan(secondReport.score)
  })
})
