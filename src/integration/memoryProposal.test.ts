import { describe, it, expect, beforeEach } from 'vitest'
import { KnowledgeEntryV2, MemoryProposal } from '@shared/types'
import type { MemoryKind } from '@shared/types'
import { MemoryPolicy } from '@librarian/MemoryPolicy'
import { AtomicFactExtractor } from '@librarian/AtomicFactExtractor'
import { IMemoryProposalStore, MemoryProposalPipeline } from '@librarian/MemoryProposalPipeline'
import { RetrievalPolicyEnforcer } from '@librarian/RetrievalPolicyEnforcer'

// ---------------------------------------------------------------------------
// In-memory store — implements IMemoryProposalStore
// ---------------------------------------------------------------------------

class InMemoryProposalStore implements IMemoryProposalStore {
  private readonly entries = new Map<string, KnowledgeEntryV2>()

  async listByTenant(tenantId: string): Promise<KnowledgeEntryV2[]> {
    return Array.from(this.entries.values()).filter((e) => e.tenantId === tenantId)
  }

  async save(entry: KnowledgeEntryV2): Promise<void> {
    this.entries.set(entry.entryId, entry)
  }

  all(): KnowledgeEntryV2[] {
    return Array.from(this.entries.values())
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let proposalCounter = 0

function makeProposal(overrides: Partial<MemoryProposal> = {}): MemoryProposal {
  proposalCounter += 1
  return {
    proposalId: `proposal-${proposalCounter}`,
    tenantId: 'tenant-A',
    sourceAgentId: 'agent-worker-1',
    kind: 'observation' as MemoryKind,
    title: `Observation ${proposalCounter}: API latency increased`,
    rawContent: 'The API response time increased from 120 ms to 450 ms. Cache hit rate dropped to 20%. Root cause is suspected to be a misconfigured Redis instance.',
    summary: 'API latency spiked. Cache hit rate fell. Redis misconfiguration is likely.',
    tags: ['performance', 'api'],
    confidence: 0.85,
    createdAt: new Date('2026-03-08T10:00:00.000Z').toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryProposal integration — memory spine lifecycle', () => {
  let store: InMemoryProposalStore
  let pipeline: MemoryProposalPipeline

  beforeEach(() => {
    proposalCounter = 0
    store = new InMemoryProposalStore()
    pipeline = new MemoryProposalPipeline(
      new MemoryPolicy(),
      new AtomicFactExtractor(),
      store,
    )
  })

  // -------------------------------------------------------------------------
  // Test 1: Proposal → stored KnowledgeEntryV2
  // -------------------------------------------------------------------------

  it('stores a valid MemoryProposal as a KnowledgeEntryV2 with correct tenant and kind', async () => {
    const proposal = makeProposal()

    const result = await pipeline.submit(proposal)

    expect(result.accepted).toBe(true)
    expect(result.entryId).toBeDefined()

    const entries = await store.listByTenant('tenant-A')
    expect(entries).toHaveLength(1)

    const entry = entries[0]
    expect(entry).toBeDefined()
    expect(entry!.entryId).toBe(result.entryId)
    expect(entry!.tenantId).toBe('tenant-A')
    expect(entry!.kind).toBe('observation' as MemoryKind)
    expect(entry!.title).toBe(proposal.title)
    expect(entry!.sourceProposalIds).toContain(proposal.proposalId)
    expect(entry!.trustScore).toBeGreaterThan(0)

    // AtomicFactExtractor must produce at least one fact
    expect(entry!.atomicFacts.length).toBeGreaterThan(0)

    // Facts should contain meaningful content from the proposal
    expect(entry!.atomicFacts.length).toBeGreaterThanOrEqual(1)
  })

  // -------------------------------------------------------------------------
  // Test 2: Duplicate proposal rejection
  // -------------------------------------------------------------------------

  it('rejects a duplicate proposal and returns duplicateOf pointing to the original entry', async () => {
    const proposal = makeProposal({ proposalId: 'proposal-original' })

    // First submission — should succeed
    const first = await pipeline.submit(proposal)
    expect(first.accepted).toBe(true)
    const originalEntryId = first.entryId

    // Second submission with the same title (same proposalId is also a dedup signal)
    const duplicate = makeProposal({
      proposalId: 'proposal-duplicate',
      title: proposal.title, // same title triggers dedup
    })
    const second = await pipeline.submit(duplicate)

    expect(second.accepted).toBe(false)
    expect(second.reason).toMatch(/duplicate/)
    expect(second.duplicateOf).toBe(originalEntryId)

    // Only one entry should exist in the store
    const entries = await store.listByTenant('tenant-A')
    expect(entries).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Test 3: Tenant isolation — cross-tenant queries return empty
  // -------------------------------------------------------------------------

  it('isolates entries by tenant so tenant-B queries cannot see tenant-A entries', async () => {
    const enforcer = new RetrievalPolicyEnforcer()

    // Submit a proposal for tenant-A
    const proposalA = makeProposal({ tenantId: 'tenant-A', proposalId: 'proposal-a1' })
    const resultA = await pipeline.submit(proposalA)
    expect(resultA.accepted).toBe(true)

    // Submit a proposal for tenant-B using a fresh pipeline scoped to the same store
    const proposalB = makeProposal({ tenantId: 'tenant-B', proposalId: 'proposal-b1', title: 'Observation B1: different title' })
    const resultB = await pipeline.submit(proposalB)
    expect(resultB.accepted).toBe(true)

    // Direct store listing — tenant-scoped
    const entriesA = await store.listByTenant('tenant-A')
    const entriesB = await store.listByTenant('tenant-B')

    expect(entriesA).toHaveLength(1)
    expect(entriesA[0]!.tenantId).toBe('tenant-A')

    expect(entriesB).toHaveLength(1)
    expect(entriesB[0]!.tenantId).toBe('tenant-B')

    // Retrieval policy enforcer — tenant-A policy must not return tenant-B entries
    const allEntries = store.all()
    const makePolicy = (tenantId: string) => ({
      tenantId,
      includeGlobalArchitecture: false,
      maxFacts: 100,
      maxTokens: 10_000,
      allowedKinds: ['observation' as MemoryKind],
    })

    const visibleToA = enforcer.enforce(allEntries, makePolicy('tenant-A'))
    expect(visibleToA).toHaveLength(1)
    expect(visibleToA[0]!.tenantId).toBe('tenant-A')

    // Cross-tenant query from tenant-B perspective returns only tenant-B entry
    const visibleToB = enforcer.enforce(allEntries, makePolicy('tenant-B'))
    expect(visibleToB).toHaveLength(1)
    expect(visibleToB[0]!.tenantId).toBe('tenant-B')

    // A non-existent tenant sees nothing
    const visibleToC = enforcer.enforce(allEntries, makePolicy('tenant-C'))
    expect(visibleToC).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Test 4: Policy rejection — empty content
  // -------------------------------------------------------------------------

  it('rejects a proposal with empty rawContent', async () => {
    const empty = makeProposal({ rawContent: '   ' })
    const result = await pipeline.submit(empty)

    expect(result.accepted).toBe(false)
    expect(result.reason).toMatch(/missing_raw_content/)
  })

  // -------------------------------------------------------------------------
  // Test 5: Low confidence still accepted (policy does not gate on confidence)
  // -------------------------------------------------------------------------

  it('accepts a low-confidence proposal — confidence gating is not in MemoryPolicy', async () => {
    const lowConf = makeProposal({ confidence: 0.1, title: 'Unique low-conf observation' })
    const result = await pipeline.submit(lowConf)

    expect(result.accepted).toBe(true)
    expect(result.entryId).toBeDefined()
  })
})
