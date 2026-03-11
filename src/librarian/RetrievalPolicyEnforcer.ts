import type { KnowledgeEntryV2, RetrievalPolicy } from '@shared/types'

export class RetrievalPolicyEnforcer {
  public enforce(entries: KnowledgeEntryV2[], policy: RetrievalPolicy): KnowledgeEntryV2[] {
    if (!policy.tenantId.trim()) {
      throw new Error('Retrieval policy requires tenantId')
    }

    const scoped = entries
      .filter((entry) => entry.tenantId === policy.tenantId)
      .filter((entry) => policy.includeGlobalArchitecture || entry.visibility !== 'global_architecture')
      .filter((entry) => policy.allowedKinds.includes(entry.kind))
      .filter((entry) => this.matchesBusinessUnit(entry, policy.businessUnitId))
      .filter((entry) => {
        if (policy.minFreshnessScore !== undefined && entry.freshnessScore < policy.minFreshnessScore) return false
        if (policy.minTrustScore !== undefined && entry.trustScore < policy.minTrustScore) return false
        if (policy.requireProvenance && (!entry.provenanceArtifacts || entry.provenanceArtifacts.length === 0)) return false
        return true
      })

    return this.applyLimits(scoped, policy.maxFacts, policy.maxTokens)
  }

  private matchesBusinessUnit(entry: KnowledgeEntryV2, businessUnitId?: string): boolean {
    if (!businessUnitId) {
      return true
    }

    const fromTag = entry.title.includes(`[bu:${businessUnitId}]`)
    const fromExtendedField = this.readBusinessUnitId(entry) === businessUnitId
    return fromTag || fromExtendedField
  }

  private readBusinessUnitId(entry: KnowledgeEntryV2): string | undefined {
    const record = entry as unknown as Record<string, unknown>
    const value = record.businessUnitId
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
    return undefined
  }

  private applyLimits(
    entries: KnowledgeEntryV2[],
    maxFacts: number,
    maxTokens: number,
  ): KnowledgeEntryV2[] {
    const bounded: KnowledgeEntryV2[] = []
    let factCount = 0
    let tokenCount = 0

    for (const entry of entries) {
      if (factCount >= maxFacts || tokenCount >= maxTokens) {
        break
      }

      const keptFacts: string[] = []
      for (const fact of entry.atomicFacts) {
        const factTokens = estimateTokenCount(fact)
        if (factCount + 1 > maxFacts || tokenCount + factTokens > maxTokens) {
          break
        }
        keptFacts.push(fact)
        factCount += 1
        tokenCount += factTokens
      }

      if (keptFacts.length > 0) {
        bounded.push({
          ...entry,
          atomicFacts: keptFacts,
        })
      }
    }

    return bounded
  }
}

function estimateTokenCount(value: string): number {
  const words = value.trim().split(/\s+/).filter(Boolean)
  return words.length
}
