import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeEntryV2, MemoryProposal } from '@shared/types'
import { AtomicFactExtractor } from './AtomicFactExtractor'
import { MemoryPolicy } from './MemoryPolicy'
import { MemoryProposalPipeline, type IMemoryProposalStore } from './MemoryProposalPipeline'

class InMemoryProposalStore implements IMemoryProposalStore {
  private readonly entries = new Map<string, KnowledgeEntryV2>()

  async listByTenant(tenantId: string): Promise<KnowledgeEntryV2[]> {
    return Array.from(this.entries.values()).filter((entry) => entry.tenantId === tenantId)
  }

  async save(entry: KnowledgeEntryV2): Promise<void> {
    this.entries.set(entry.entryId, entry)
  }

  get(entryId: string): KnowledgeEntryV2 | undefined {
    return this.entries.get(entryId)
  }

  all(): KnowledgeEntryV2[] {
    return Array.from(this.entries.values())
  }
}

function makeProposal(overrides: Partial<MemoryProposal> = {}): MemoryProposal {
  return {
    proposalId: 'proposal-1',
    tenantId: 'tenant-1',
    sourceAgentId: 'agent-writer',
    kind: 'observation',
    title: 'Dispatcher behavior',
    rawContent: 'Dispatcher retries failed nodes. Dispatcher escalates after limit.',
    summary: 'runtime behavior',
    tags: ['runtime'],
    confidence: 0.8,
    createdAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('MemoryProposalPipeline', () => {
  let store: InMemoryProposalStore
  let pipeline: MemoryProposalPipeline

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T00:00:00.000Z'))
    store = new InMemoryProposalStore()
    pipeline = new MemoryProposalPipeline(
      new MemoryPolicy({ allowedWriterIds: ['agent-writer'] }),
      new AtomicFactExtractor(),
      store,
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts valid proposal and writes knowledge entry', async () => {
    const result = await pipeline.submit(makeProposal())

    expect(result.accepted).toBe(true)
    expect(result.entryId).toBeDefined()
    expect(store.get(result.entryId as string)?.atomicFacts.length).toBeGreaterThan(0)
  })

  it('rejects policy-invalid writer', async () => {
    const result = await pipeline.submit(makeProposal({ sourceAgentId: 'agent-unauthorized' }))

    expect(result).toMatchObject({
      accepted: false,
      reason: 'writer_not_allowed',
    })
  })

  it('detects duplicates by normalized atomic facts', async () => {
    const first = await pipeline.submit(makeProposal())
    const second = await pipeline.submit(makeProposal({ proposalId: 'proposal-2' }))

    expect(first.accepted).toBe(true)
    expect(second).toMatchObject({
      accepted: false,
      reason: 'duplicate_entry',
      duplicateOf: first.entryId,
    })
  })

  it('marks prior entry as superseded for same title and kind', async () => {
    const first = await pipeline.submit(makeProposal({ rawContent: 'Dispatcher retries failed nodes.' }))
    const second = await pipeline.submit(
      makeProposal({
        proposalId: 'proposal-2',
        rawContent: 'Dispatcher retries failed nodes. Dispatcher hibernates on outage.',
      }),
    )

    const superseded = store.get(first.entryId as string)
    const latest = store.get(second.entryId as string)

    expect(second.accepted).toBe(true)
    expect(latest?.supersedesEntryId).toBe(first.entryId)
    expect(superseded?.kind).toBe('deprecated_knowledge')
  })

  it('calculates bounded trust score', async () => {
    const result = await pipeline.submit(makeProposal({ confidence: 0.95 }))
    const entry = store.get(result.entryId as string)

    expect(entry?.trustScore).toBeGreaterThan(0)
    expect(entry?.trustScore).toBeLessThanOrEqual(1)
  })

  it('applies freshness decay for old proposals', async () => {
    const result = await pipeline.submit(
      makeProposal({
        proposalId: 'proposal-old',
        createdAt: '2025-12-01T00:00:00.000Z',
      }),
    )

    const entry = store.get(result.entryId as string)
    expect(entry?.freshnessScore).toBeLessThan(1)
  })

  it('preserves tenant tagging in stored entries', async () => {
    const result = await pipeline.submit(makeProposal({ tenantId: 'tenant-special' }))
    const entry = store.get(result.entryId as string)

    expect(entry?.tenantId).toBe('tenant-special')
  })

  it('preserves memory kind', async () => {
    const result = await pipeline.submit(makeProposal({ kind: 'runbook' }))
    const entry = store.get(result.entryId as string)

    expect(entry?.kind).toBe('runbook')
  })

  it('rejects proposals with no extractable facts', async () => {
    const result = await pipeline.submit(
      makeProposal({
        proposalId: 'proposal-empty',
        rawContent: '    ',
      }),
    )

    expect(result).toMatchObject({
      accepted: false,
    })
  })

  it('handles concurrent submissions deterministically', async () => {
    const [first, second] = await Promise.all([
      pipeline.submit(makeProposal({ proposalId: 'proposal-a' })),
      pipeline.submit(makeProposal({ proposalId: 'proposal-b' })),
    ])

    const acceptedCount = [first, second].filter((result) => result.accepted).length
    const rejectedCount = [first, second].filter((result) => !result.accepted).length

    expect(acceptedCount).toBe(1)
    expect(rejectedCount).toBe(1)
    expect(store.all().length).toBeGreaterThanOrEqual(1)
  })
})
