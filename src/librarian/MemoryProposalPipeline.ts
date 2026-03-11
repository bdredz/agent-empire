import type { KnowledgeEntryV2, MemoryProposal } from '@shared/types'
import { AtomicFactExtractor } from './AtomicFactExtractor'
import { MemoryPolicy } from './MemoryPolicy'

export interface IMemoryProposalStore {
  listByTenant(tenantId: string): Promise<KnowledgeEntryV2[]>
  save(entry: KnowledgeEntryV2): Promise<void>
}

export interface MemoryProposalResult {
  accepted: boolean
  entryId?: string
  reason?: string
  duplicateOf?: string
}

export class MemoryProposalPipeline {
  private readonly tenantLocks = new Map<string, Promise<MemoryProposalResult>>()

  constructor(
    private readonly policy: MemoryPolicy,
    private readonly extractor: AtomicFactExtractor,
    private readonly store: IMemoryProposalStore,
  ) {}

  public async submit(proposal: MemoryProposal): Promise<MemoryProposalResult> {
    const previous = this.tenantLocks.get(proposal.tenantId) ?? Promise.resolve({
      accepted: true,
    } as MemoryProposalResult)

    const current = previous.then(() => this.process(proposal))
    this.tenantLocks.set(proposal.tenantId, current)

    try {
      return await current
    } finally {
      if (this.tenantLocks.get(proposal.tenantId) === current) {
        this.tenantLocks.delete(proposal.tenantId)
      }
    }
  }

  private async process(proposal: MemoryProposal): Promise<MemoryProposalResult> {
    const decision = this.policy.evaluate(proposal)
    if (!decision.accepted) {
      return {
        accepted: false,
        reason: decision.reason ?? 'policy_rejected',
      }
    }

    const scoredFacts = this.extractor.extractWithScores(proposal.rawContent)
    if (scoredFacts.length === 0) {
      return {
        accepted: false,
        reason: 'no_atomic_facts',
      }
    }

    const atomicFacts = scoredFacts.map((entry) => entry.fact)
    const existing = await this.store.listByTenant(proposal.tenantId)
    const duplicate = findDuplicate(existing, proposal, atomicFacts)
    if (duplicate) {
      return {
        accepted: false,
        reason: 'duplicate_entry',
        duplicateOf: duplicate.entryId,
      }
    }

    const now = new Date().toISOString()
    const superseded = findSuperseded(existing, proposal)
    if (superseded) {
      await this.store.save({
        ...superseded,
        kind: 'deprecated_knowledge',
        expiresAt: now,
        updatedAt: now,
      })
    }

    const confidence = scoredFacts.reduce((sum, fact) => sum + fact.confidence, 0) / scoredFacts.length
    const entry: KnowledgeEntryV2 = {
      entryId: `entry-${proposal.proposalId}`,
      tenantId: proposal.tenantId,
      visibility: proposal.tags.includes('global_architecture') ? 'global_architecture' : 'tenant',
      kind: proposal.kind,
      title: proposal.title,
      atomicFacts,
      sourceProposalIds: [proposal.proposalId],
      trustScore: clamp((proposal.confidence + confidence) / 2, 0, 1),
      freshnessScore: computeFreshnessScore(proposal.createdAt),
      provenanceArtifacts: proposal.sourceArtifacts,
      supersedesEntryId: superseded?.entryId,
      createdAt: now,
      updatedAt: now,
    }

    await this.store.save(entry)

    return {
      accepted: true,
      entryId: entry.entryId,
    }
  }
}

function findDuplicate(
  existing: KnowledgeEntryV2[],
  proposal: MemoryProposal,
  atomicFacts: string[],
): KnowledgeEntryV2 | undefined {
  const signature = toSignature(atomicFacts)
  return existing.find((entry) => {
    if (entry.kind !== proposal.kind || entry.title !== proposal.title) {
      return false
    }
    return toSignature(entry.atomicFacts) === signature
  })
}

function findSuperseded(existing: KnowledgeEntryV2[], proposal: MemoryProposal): KnowledgeEntryV2 | undefined {
  const candidates = existing
    .filter((entry) => entry.kind === proposal.kind)
    .filter((entry) => entry.title === proposal.title)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  return candidates[0]
}

function toSignature(facts: string[]): string {
  return facts
    .map((fact) => fact.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim())
    .sort()
    .join('|')
}

function computeFreshnessScore(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime()
  if (!Number.isFinite(ageMs) || ageMs <= 0) {
    return 1
  }

  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  const decay = ageDays / 30
  return clamp(1 - decay, 0.1, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
