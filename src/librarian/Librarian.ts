import {
  ArtifactId,
  CapabilityManifest,
  KnowledgeEntry,
  KnowledgeEntryV2,
  MemoryProposal,
  RetrievalPolicy,
} from '@shared/types'
import {
  ILibrarian,
  IngestResult,
  PruneResult,
  QueryFilters,
  ResolutionResult,
  SubmitProposalResult,
} from '@librarian/ILibrarian'
import { AtomicFactExtractor } from './AtomicFactExtractor'
import { MemoryPolicy } from './MemoryPolicy'
import { MemoryProposalPipeline, type IMemoryProposalStore } from './MemoryProposalPipeline'
import { RetrievalPolicyEnforcer } from './RetrievalPolicyEnforcer'
import { applyDefaultExpiry, findDuplicate, readEnvCsv, readEnvNumber } from './LibrarianUtils'

export interface VectorMatch {
  readonly entry: KnowledgeEntry
  readonly similarity: number
}

export interface ILibrarianStore {
  save(entry: KnowledgeEntry): Promise<void>
  getById(id: ArtifactId): Promise<KnowledgeEntry | null>
  searchByText(query: string, filters?: QueryFilters): Promise<KnowledgeEntry[]>
  searchByVector(embedding: number[], filters?: QueryFilters): Promise<VectorMatch[]>
  removeOlderThan(olderThanIso: string): Promise<ArtifactId[]>
  saveV2?(entry: KnowledgeEntryV2): Promise<void>
  listByTenantV2?(tenantId: string): Promise<KnowledgeEntryV2[]>
}

const DEFAULT_DEDUP_THRESHOLD = 0.92
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60
const DEFAULT_MAX_RAW_CONTENT_LENGTH = 12_000
const DEFAULT_MAX_ATOMIC_FACTS = 20

export class Librarian implements ILibrarian {
  private readonly dedupThreshold: number
  private readonly defaultTtlSec: number
  private readonly fallbackV2Store = new Map<string, KnowledgeEntryV2>()
  private readonly proposalPipeline: MemoryProposalPipeline
  private readonly retrievalEnforcer: RetrievalPolicyEnforcer

  constructor(private readonly store: ILibrarianStore) {
    this.dedupThreshold = readEnvNumber('LIBRARIAN_DEDUP_THRESHOLD', DEFAULT_DEDUP_THRESHOLD, 0, 1)
    this.defaultTtlSec = readEnvNumber('LIBRARIAN_DEFAULT_TTL_SEC', DEFAULT_TTL_SEC, 1)
    const memoryPolicy = new MemoryPolicy({
      allowedWriterIds: readEnvCsv('LIBRARIAN_ALLOWED_WRITERS', ['*']),
      maxRawContentLength: readEnvNumber(
        'LIBRARIAN_MAX_RAW_CONTENT_LENGTH',
        DEFAULT_MAX_RAW_CONTENT_LENGTH,
        1,
      ),
    })
    const factExtractor = new AtomicFactExtractor({
      maxFacts: readEnvNumber('LIBRARIAN_MAX_ATOMIC_FACTS', DEFAULT_MAX_ATOMIC_FACTS, 1),
    })
    this.retrievalEnforcer = new RetrievalPolicyEnforcer()
    this.proposalPipeline = new MemoryProposalPipeline(memoryPolicy, factExtractor, this.createV2StoreAdapter())
  }

  public async ingest(entry: KnowledgeEntry): Promise<IngestResult> {
    if (!entry.content.trim()) {
      return { accepted: false, reason: 'invalid' }
    }

    const normalized = applyDefaultExpiry(entry, this.defaultTtlSec)
    const duplicateOf = await findDuplicate(this.store, this.dedupThreshold, normalized)
    if (duplicateOf) {
      return { accepted: false, reason: 'duplicate', duplicateOf }
    }

    await this.store.save(normalized)
    return { accepted: true, reason: 'inserted', entryId: normalized.id }
  }

  public async query(query: string, filters?: QueryFilters): Promise<KnowledgeEntry[]> {
    const matches = await this.store.searchByText(query, filters)
    const filtered = matches.filter((entry) => {
      if (!filters?.includeExpired && entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()) {
        return false
      }
      if (filters?.minConfidence !== undefined && entry.confidence < filters.minConfidence) {
        return false
      }
      if (filters?.tags && filters.tags.some((tag) => !entry.tags.includes(tag))) {
        return false
      }
      return true
    })

    const limit = filters?.limit
    return typeof limit === 'number' && limit >= 0 ? filtered.slice(0, limit) : filtered
  }

  public async prune(olderThan: string): Promise<PruneResult> {
    const removedIds = await this.store.removeOlderThan(olderThan)
    return { removed: removedIds.length, removedIds }
  }

  public async resolveConflict(entryA: ArtifactId, entryB: ArtifactId): Promise<ResolutionResult> {
    const left = await this.store.getById(entryA)
    const right = await this.store.getById(entryB)

    if (!left || !right) {
      throw new Error('Conflict resolution requires two existing entries')
    }

    const byConfidence = left.confidence - right.confidence
    if (byConfidence > 0) {
      return { winnerId: left.id, loserId: right.id, strategy: 'higher_confidence' }
    }
    if (byConfidence < 0) {
      return { winnerId: right.id, loserId: left.id, strategy: 'higher_confidence' }
    }

    const byTime = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    if (byTime > 0) {
      return { winnerId: left.id, loserId: right.id, strategy: 'newer_entry' }
    }
    if (byTime < 0) {
      return { winnerId: right.id, loserId: left.id, strategy: 'newer_entry' }
    }

    const ordered = [left.id as string, right.id as string].sort()
    return {
      winnerId: ordered[0] === (left.id as string) ? left.id : right.id,
      loserId: ordered[0] === (left.id as string) ? right.id : left.id,
      strategy: 'deterministic_tie_break',
    }
  }

  public async submitProposal(proposal: MemoryProposal): Promise<SubmitProposalResult> {
    const result = await this.proposalPipeline.submit(proposal)
    return {
      accepted: result.accepted,
      entryId: result.entryId,
      reason: result.reason,
    }
  }

  public async queryV2(query: string, policy: RetrievalPolicy): Promise<KnowledgeEntryV2[]> {
    const allForTenant = await this.listV2ByTenant(policy.tenantId)
    const q = query.trim().toLowerCase()
    const matched = q.length === 0
      ? allForTenant
      : allForTenant.filter((entry) => {
        if (entry.title.toLowerCase().includes(q)) {
          return true
        }
        return entry.atomicFacts.some((fact) => fact.toLowerCase().includes(q))
      })
    return this.retrievalEnforcer.enforce(matched, policy)
  }

  private createV2StoreAdapter(): IMemoryProposalStore {
    return {
      listByTenant: async (tenantId: string) => this.listV2ByTenant(tenantId),
      save: async (entry: KnowledgeEntryV2) => this.saveV2Entry(entry),
    }
  }

  private async listV2ByTenant(tenantId: string): Promise<KnowledgeEntryV2[]> {
    if (this.store.listByTenantV2) {
      return this.store.listByTenantV2(tenantId)
    }
    return Array.from(this.fallbackV2Store.values()).filter((entry) => entry.tenantId === tenantId)
  }

  private async saveV2Entry(entry: KnowledgeEntryV2): Promise<void> {
    if (this.store.saveV2) {
      await this.store.saveV2(entry)
      return
    }
    this.fallbackV2Store.set(entry.entryId, entry)
  }

}

export function createCapabilityManifestProposal(manifest: CapabilityManifest): MemoryProposal {
  return {
    proposalId: manifest.manifestId,
    tenantId: manifest.tenantId,
    businessUnitId: manifest.businessUnitId,
    sourceAgentId: 'mechanic',
    kind: 'capability_manifest',
    title: `${manifest.serviceName} capability manifest`,
    rawContent: JSON.stringify(manifest),
    summary: `${manifest.serviceName} ${manifest.version} at ${manifest.baseUrl}`,
    tags: ['capability_manifest', manifest.serviceName, manifest.authScheme],
    confidence: typeof manifest.reliabilityScore === 'number' ? Math.min(1, Math.max(0, manifest.reliabilityScore / 100)) : 0.9,
    createdAt: manifest.createdAt,
  }
}
