import type {
  KnowledgeEntryV2,
  MemoryKind,
  MemoryProposal,
  RetrievalPolicy,
} from '@shared/types'

export type { MemoryKind, MemoryProposal, KnowledgeEntryV2, RetrievalPolicy }

const PROMOTION_KINDS: ReadonlySet<MemoryKind> = new Set([
  'verified_pattern',
  'runbook',
  'capability_manifest',
  'policy_record',
  'incident_record',
])

export function isPromotion(proposal: MemoryProposal): boolean {
  return PROMOTION_KINDS.has(proposal.kind)
}

export function isSupersession(entry: KnowledgeEntryV2): boolean {
  return typeof entry.supersedesEntryId === 'string' && entry.supersedesEntryId.length > 0
}

export function createDefaultRetrievalPolicy(tenantId: string): RetrievalPolicy {
  return {
    tenantId,
    includeGlobalArchitecture: true,
    maxFacts: 20,
    maxTokens: 2000,
    allowedKinds: [
      'observation',
      'verified_pattern',
      'runbook',
      'policy_record',
      'incident_record',
      'capability_manifest',
    ],
  }
}
