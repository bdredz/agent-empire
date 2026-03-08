import { describe, expect, it } from 'vitest'
import type { KnowledgeEntryV2, RetrievalPolicy } from '@shared/types'
import { RetrievalPolicyEnforcer } from './RetrievalPolicyEnforcer'

function makePolicy(overrides: Partial<RetrievalPolicy> = {}): RetrievalPolicy {
  return {
    tenantId: 'tenant-a',
    includeGlobalArchitecture: false,
    maxFacts: 10,
    maxTokens: 100,
    allowedKinds: ['observation', 'verified_pattern'],
    ...overrides,
  }
}

function makeEntry(overrides: Partial<KnowledgeEntryV2> = {}): KnowledgeEntryV2 {
  return {
    entryId: 'entry-1',
    tenantId: 'tenant-a',
    visibility: 'tenant',
    kind: 'observation',
    title: 'Entry',
    atomicFacts: ['Fact one'],
    sourceProposalIds: ['proposal-1'],
    trustScore: 0.8,
    freshnessScore: 0.9,
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('RetrievalPolicyEnforcer', () => {
  it('enforces strict tenant isolation', () => {
    const enforcer = new RetrievalPolicyEnforcer()
    const result = enforcer.enforce(
      [
        makeEntry({ entryId: 'in-tenant' }),
        makeEntry({ entryId: 'other-tenant', tenantId: 'tenant-b' }),
      ],
      makePolicy(),
    )

    expect(result.map((entry) => entry.entryId)).toEqual(['in-tenant'])
  })

  it('filters by business unit tag when policy requests it', () => {
    const enforcer = new RetrievalPolicyEnforcer()
    const result = enforcer.enforce(
      [
        makeEntry({ entryId: 'bu-a', title: '[bu:business-a] item' }),
        makeEntry({ entryId: 'bu-b', title: '[bu:business-b] item' }),
      ],
      makePolicy({ businessUnitId: 'business-a' }),
    )

    expect(result.map((entry) => entry.entryId)).toEqual(['bu-a'])
  })

  it('excludes global architecture entries when policy disables them', () => {
    const enforcer = new RetrievalPolicyEnforcer()
    const result = enforcer.enforce(
      [
        makeEntry({ entryId: 'tenant' }),
        makeEntry({ entryId: 'global', visibility: 'global_architecture' }),
      ],
      makePolicy({ includeGlobalArchitecture: false }),
    )

    expect(result.map((entry) => entry.entryId)).toEqual(['tenant'])
  })

  it('includes global architecture entries when enabled', () => {
    const enforcer = new RetrievalPolicyEnforcer()
    const result = enforcer.enforce(
      [
        makeEntry({ entryId: 'tenant' }),
        makeEntry({ entryId: 'global', visibility: 'global_architecture' }),
      ],
      makePolicy({ includeGlobalArchitecture: true }),
    )

    expect(result.map((entry) => entry.entryId)).toEqual(['tenant', 'global'])
  })

  it('filters by allowed kinds', () => {
    const enforcer = new RetrievalPolicyEnforcer()
    const result = enforcer.enforce(
      [
        makeEntry({ entryId: 'allowed', kind: 'observation' }),
        makeEntry({ entryId: 'blocked', kind: 'incident_record' }),
      ],
      makePolicy({ allowedKinds: ['observation'] }),
    )

    expect(result.map((entry) => entry.entryId)).toEqual(['allowed'])
  })

  it('enforces max facts limit', () => {
    const enforcer = new RetrievalPolicyEnforcer()
    const result = enforcer.enforce(
      [
        makeEntry({
          entryId: 'entry',
          atomicFacts: ['one', 'two', 'three'],
        }),
      ],
      makePolicy({ maxFacts: 2 }),
    )

    expect(result[0]?.atomicFacts).toEqual(['one', 'two'])
  })

  it('enforces max tokens limit', () => {
    const enforcer = new RetrievalPolicyEnforcer()
    const result = enforcer.enforce(
      [
        makeEntry({
          entryId: 'entry',
          atomicFacts: ['one two three', 'four five six', 'seven'],
        }),
      ],
      makePolicy({ maxTokens: 5 }),
    )

    expect(result[0]?.atomicFacts).toEqual(['one two three'])
  })

  it('returns empty results when nothing matches policy', () => {
    const enforcer = new RetrievalPolicyEnforcer()
    const result = enforcer.enforce(
      [makeEntry({ tenantId: 'tenant-b' })],
      makePolicy({ tenantId: 'tenant-a' }),
    )

    expect(result).toEqual([])
  })

  it('rejects policy without tenantId', () => {
    const enforcer = new RetrievalPolicyEnforcer()

    expect(() => enforcer.enforce([makeEntry()], makePolicy({ tenantId: '' })))
      .toThrow('Retrieval policy requires tenantId')
  })
})
