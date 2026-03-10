import { AgentId } from '@shared/types'
import { IAgentIdentityService } from './IAgentIdentityService'

export type ReputationEvent =
  | 'task_completed'
  | 'task_failed'
  | 'refund_issued'
  | 'dispute_filed'
  | 'policy_violation'
  | 'heartbeat'

export interface ReputationRecord {
  agentId: AgentId
  totalTasks: number
  successfulTasks: number
  failedTasks: number
  refundsIssued: number
  disputesFiled: number
  policyViolations: number
  heartbeatCount: number
  firstSeenAt: string
  lastUpdatedAt: string
  lastHeartbeatAt?: string
}

export interface ReputationReport {
  agentId: AgentId
  successRate: number
  refundRate: number
  disputeRate: number
  policyViolationRate: number
  uptimeScore: number
  score: number
}

export interface AgentReputationServiceOptions {
  now: () => Date
}

export class AgentReputationService {
  private readonly records = new Map<AgentId, ReputationRecord>()
  private readonly now: () => Date

  constructor(
    private readonly identityService: IAgentIdentityService,
    options: Partial<AgentReputationServiceOptions> = {},
  ) {
    this.now = options.now ?? (() => new Date())
  }

  public async recordEvent(
    agentId: AgentId,
    event: ReputationEvent,
  ): Promise<ReputationReport> {
    await this.requireIdentity(agentId)

    const record = this.getOrCreateRecord(agentId)
    record.lastUpdatedAt = this.now().toISOString()

    if (event === 'task_completed') {
      record.totalTasks += 1
      record.successfulTasks += 1
    } else if (event === 'task_failed') {
      record.totalTasks += 1
      record.failedTasks += 1
    } else if (event === 'refund_issued') {
      record.refundsIssued += 1
    } else if (event === 'dispute_filed') {
      record.disputesFiled += 1
    } else if (event === 'policy_violation') {
      record.policyViolations += 1
    } else if (event === 'heartbeat') {
      record.heartbeatCount += 1
      record.lastHeartbeatAt = record.lastUpdatedAt
    }

    return this.toReport(record)
  }

  public async getReport(agentId: AgentId): Promise<ReputationReport> {
    await this.requireIdentity(agentId)
    return this.toReport(this.getOrCreateRecord(agentId))
  }

  private async requireIdentity(agentId: AgentId): Promise<void> {
    const identity = await this.identityService.get(agentId)
    if (!identity) {
      throw new Error(`Identity not found for agent: ${agentId}`)
    }
  }

  private getOrCreateRecord(agentId: AgentId): ReputationRecord {
    const existing = this.records.get(agentId)
    if (existing) {
      return existing
    }

    const nowIso = this.now().toISOString()
    const created: ReputationRecord = {
      agentId,
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      refundsIssued: 0,
      disputesFiled: 0,
      policyViolations: 0,
      heartbeatCount: 0,
      firstSeenAt: nowIso,
      lastUpdatedAt: nowIso,
    }
    this.records.set(agentId, created)
    return created
  }

  private toReport(record: ReputationRecord): ReputationReport {
    const totalTasks = Math.max(1, record.totalTasks)
    const successRate = record.successfulTasks / totalTasks
    const refundRate = record.refundsIssued / totalTasks
    const disputeRate = record.disputesFiled / totalTasks
    const policyViolationRate = record.policyViolations / totalTasks
    const uptimeScore = this.computeUptimeScore(record.lastHeartbeatAt)
    const decayPenalty = this.computeDecayPenalty(record.lastUpdatedAt)

    const rawScore =
      100
      - (1 - successRate) * 30
      - refundRate * 15
      - disputeRate * 20
      - policyViolationRate * 30
      + uptimeScore * 10
      - decayPenalty

    return {
      agentId: record.agentId,
      successRate,
      refundRate,
      disputeRate,
      policyViolationRate,
      uptimeScore,
      score: clampScore(rawScore),
    }
  }

  private computeUptimeScore(lastHeartbeatAt?: string): number {
    if (!lastHeartbeatAt) {
      return 0.5
    }

    const deltaMs = this.now().getTime() - Date.parse(lastHeartbeatAt)
    const oneHour = 3_600_000
    const oneDay = oneHour * 24
    const oneWeek = oneDay * 7

    if (deltaMs <= oneHour) {
      return 1
    }
    if (deltaMs <= oneDay) {
      return 0.8
    }
    if (deltaMs <= oneWeek) {
      return 0.6
    }
    return 0.3
  }

  private computeDecayPenalty(lastUpdatedAt: string): number {
    const deltaDays = (this.now().getTime() - Date.parse(lastUpdatedAt)) / 86_400_000
    if (deltaDays <= 1) {
      return 0
    }
    return Math.min(20, Math.floor(deltaDays) * 2)
  }
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Number(score.toFixed(2))))
}
