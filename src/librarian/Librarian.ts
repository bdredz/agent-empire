import { ArtifactId, KnowledgeEntry } from '@shared/types'
import { ILibrarian, IngestResult, PruneResult, QueryFilters, ResolutionResult } from '@librarian/ILibrarian'

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
}

const DEFAULT_DEDUP_THRESHOLD = 0.92
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60

export class Librarian implements ILibrarian {
  private readonly dedupThreshold: number
  private readonly defaultTtlSec: number

  constructor(private readonly store: ILibrarianStore) {
    this.dedupThreshold = this.readEnvNumber('LIBRARIAN_DEDUP_THRESHOLD', DEFAULT_DEDUP_THRESHOLD, 0, 1)
    this.defaultTtlSec = this.readEnvNumber('LIBRARIAN_DEFAULT_TTL_SEC', DEFAULT_TTL_SEC, 1)
  }

  public async ingest(entry: KnowledgeEntry): Promise<IngestResult> {
    if (!entry.content.trim()) {
      return { accepted: false, reason: 'invalid' }
    }

    const normalized = this.applyDefaultExpiry(entry)
    const duplicateOf = await this.findDuplicate(normalized)
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
      winnerId: (ordered[0] === (left.id as string) ? left.id : right.id),
      loserId: (ordered[0] === (left.id as string) ? right.id : left.id),
      strategy: 'deterministic_tie_break',
    }
  }

  private async findDuplicate(entry: KnowledgeEntry): Promise<ArtifactId | undefined> {
    const textMatches = await this.store.searchByText(entry.content, { businessId: entry.businessId, limit: 5 })
    const exact = textMatches.find((candidate) => candidate.content.trim() === entry.content.trim())
    if (exact) {
      return exact.id
    }

    if (!entry.embedding || entry.embedding.length === 0) {
      return undefined
    }

    // Store implementations should execute this through pgvector similarity (`embedding <=> query_vector`).
    const vectorMatches = await this.store.searchByVector(entry.embedding, { businessId: entry.businessId, limit: 1 })
    const top = vectorMatches[0]
    if (top && top.similarity >= this.dedupThreshold) {
      return top.entry.id
    }
    return undefined
  }

  private applyDefaultExpiry(entry: KnowledgeEntry): KnowledgeEntry {
    if (entry.expiresAt) {
      return entry
    }

    const expiresAt = new Date(Date.now() + this.defaultTtlSec * 1000).toISOString()
    return { ...entry, expiresAt }
  }

  private readEnvNumber(key: string, fallback: number, min: number, max?: number): number {
    const raw = process.env[key]
    if (!raw) {
      return fallback
    }

    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < min) {
      return fallback
    }
    if (max !== undefined && parsed > max) {
      return fallback
    }
    return parsed
  }
}
