import {
  ArtifactId,
  BusinessId,
  KnowledgeEntry,
  KnowledgeEntryV2,
  MemoryProposal,
  RetrievalPolicy,
} from '@shared/types'

export interface QueryFilters {
  readonly businessId?: BusinessId
  readonly tags?: string[]
  readonly minConfidence?: number
  readonly includeExpired?: boolean
  readonly limit?: number
}

export interface IngestResult {
  readonly accepted: boolean
  readonly reason: 'inserted' | 'duplicate' | 'invalid'
  readonly entryId?: ArtifactId
  readonly duplicateOf?: ArtifactId
}

export interface PruneResult {
  readonly removed: number
  readonly removedIds: ArtifactId[]
}

export interface ResolutionResult {
  readonly winnerId: ArtifactId
  readonly loserId: ArtifactId
  readonly strategy: 'higher_confidence' | 'newer_entry' | 'deterministic_tie_break'
}

export interface SubmitProposalResult {
  readonly accepted: boolean
  readonly entryId?: string
  readonly reason?: string
}

export interface ILibrarian {
  ingest(entry: KnowledgeEntry): Promise<IngestResult>
  query(query: string, filters?: QueryFilters): Promise<KnowledgeEntry[]>
  prune(olderThan: string): Promise<PruneResult>
  resolveConflict(entryA: ArtifactId, entryB: ArtifactId): Promise<ResolutionResult>
  submitProposal(proposal: MemoryProposal): Promise<SubmitProposalResult>
  queryV2(query: string, policy: RetrievalPolicy): Promise<KnowledgeEntryV2[]>
}
