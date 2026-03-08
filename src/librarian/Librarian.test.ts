import { beforeEach, describe, expect, it } from 'vitest'
import { ArtifactId, KnowledgeEntry, createAgentId, createArtifactId } from '@shared/types'
import { ILibrarianStore, Librarian, VectorMatch } from '@librarian/Librarian'

class InMemoryLibrarianStore implements ILibrarianStore {
  private readonly entries = new Map<string, KnowledgeEntry>()

  async save(entry: KnowledgeEntry): Promise<void> {
    this.entries.set(entry.id as string, entry)
  }

  async getById(id: ArtifactId): Promise<KnowledgeEntry | null> {
    return this.entries.get(id as string) ?? null
  }

  async searchByText(query: string): Promise<KnowledgeEntry[]> {
    const q = query.trim().toLowerCase()
    return Array.from(this.entries.values()).filter((entry) => entry.content.toLowerCase().includes(q))
  }

  async searchByVector(embedding: number[]): Promise<VectorMatch[]> {
    const scored = Array.from(this.entries.values())
      .filter((entry) => Array.isArray(entry.embedding) && entry.embedding.length === embedding.length)
      .map((entry) => ({
        entry,
        similarity: cosineSimilarity(entry.embedding as number[], embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
    return scored
  }

  async removeOlderThan(olderThanIso: string): Promise<ArtifactId[]> {
    const cutoff = new Date(olderThanIso).getTime()
    const removed: ArtifactId[] = []

    for (const [id, entry] of this.entries.entries()) {
      if (new Date(entry.createdAt).getTime() < cutoff) {
        removed.push(entry.id)
        this.entries.delete(id)
      }
    }

    return removed
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0)
  const normA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0))
  const normB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0))
  if (normA === 0 || normB === 0) {
    return 0
  }
  return dot / (normA * normB)
}

let entryCounter = 0

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  entryCounter += 1
  const now = new Date('2026-03-04T12:00:00.000Z').toISOString()
  return {
    id: createArtifactId(`artifact-${entryCounter}`),
    content: 'Lead source: inbound form',
    source: {
      agentId: createAgentId('agent-librarian'),
      sourceType: 'agent_output',
    },
    tags: ['sales'],
    createdAt: now,
    confidence: 0.8,
    ...overrides,
  }
}

describe('Librarian', () => {
  beforeEach(() => {
    entryCounter = 0
    delete process.env.LIBRARIAN_DEDUP_THRESHOLD
    delete process.env.LIBRARIAN_DEFAULT_TTL_SEC
  })

  it('ingests valid entries and sets default TTL', async () => {
    const store = new InMemoryLibrarianStore()
    const librarian = new Librarian(store)

    const result = await librarian.ingest(makeEntry())

    expect(result.accepted).toBe(true)
    const saved = await store.getById(result.entryId as ArtifactId)
    expect(saved?.expiresAt).toBeDefined()
  })

  it('rejects empty content', async () => {
    const librarian = new Librarian(new InMemoryLibrarianStore())

    const result = await librarian.ingest(makeEntry({ content: '   ' }))

    expect(result).toEqual({ accepted: false, reason: 'invalid' })
  })

  it('rejects exact content duplicates', async () => {
    const store = new InMemoryLibrarianStore()
    const existing = makeEntry({ id: createArtifactId('artifact-existing') })
    await store.save(existing)

    const librarian = new Librarian(store)
    const result = await librarian.ingest(makeEntry({ content: existing.content }))

    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('duplicate')
    expect(result.duplicateOf).toBe(existing.id)
  })

  it('rejects vector-similar duplicates above threshold', async () => {
    process.env.LIBRARIAN_DEDUP_THRESHOLD = '0.8'
    const store = new InMemoryLibrarianStore()
    const existing = makeEntry({
      id: createArtifactId('artifact-vector'),
      content: 'Primary vector sample',
      embedding: [1, 0, 0],
    })
    await store.save(existing)

    const librarian = new Librarian(store)
    const result = await librarian.ingest(makeEntry({ content: 'Secondary vector sample', embedding: [0.95, 0.01, 0] }))

    expect(result.accepted).toBe(false)
    expect(result.duplicateOf).toBe(existing.id)
  })

  it('accepts vector entries below threshold', async () => {
    process.env.LIBRARIAN_DEDUP_THRESHOLD = '0.95'
    const store = new InMemoryLibrarianStore()
    await store.save(makeEntry({ id: createArtifactId('artifact-low-sim'), content: 'High-sim anchor', embedding: [1, 0, 0] }))

    const librarian = new Librarian(store)
    const result = await librarian.ingest(makeEntry({ content: 'Low-sim candidate', embedding: [0.1, 0.9, 0] }))

    expect(result.accepted).toBe(true)
  })

  it('filters expired entries by default in query', async () => {
    const store = new InMemoryLibrarianStore()
    await store.save(makeEntry({ id: createArtifactId('fresh'), expiresAt: '2099-01-01T00:00:00.000Z' }))
    await store.save(makeEntry({ id: createArtifactId('expired'), expiresAt: '2000-01-01T00:00:00.000Z' }))

    const librarian = new Librarian(store)
    const results = await librarian.query('lead')

    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe(createArtifactId('fresh'))
  })

  it('includes expired entries when requested', async () => {
    const store = new InMemoryLibrarianStore()
    await store.save(makeEntry({ id: createArtifactId('expired-1'), expiresAt: '2000-01-01T00:00:00.000Z' }))

    const librarian = new Librarian(store)
    const results = await librarian.query('lead', { includeExpired: true })

    expect(results).toHaveLength(1)
  })

  it('applies minConfidence and tag filters with limit', async () => {
    const store = new InMemoryLibrarianStore()
    await store.save(makeEntry({ id: createArtifactId('entry-1'), confidence: 0.9, tags: ['sales', 'crm'] }))
    await store.save(makeEntry({ id: createArtifactId('entry-2'), confidence: 0.95, tags: ['sales', 'crm'] }))
    await store.save(makeEntry({ id: createArtifactId('entry-3'), confidence: 0.5, tags: ['sales'] }))

    const librarian = new Librarian(store)
    const results = await librarian.query('lead', { minConfidence: 0.8, tags: ['crm'], limit: 1 })

    expect(results).toHaveLength(1)
  })

  it('prunes older entries', async () => {
    const store = new InMemoryLibrarianStore()
    await store.save(makeEntry({ id: createArtifactId('old-entry'), createdAt: '2020-01-01T00:00:00.000Z' }))
    await store.save(makeEntry({ id: createArtifactId('new-entry'), createdAt: '2027-01-01T00:00:00.000Z' }))

    const librarian = new Librarian(store)
    const result = await librarian.prune('2021-01-01T00:00:00.000Z')

    expect(result.removed).toBe(1)
    expect(result.removedIds[0]).toBe(createArtifactId('old-entry'))
  })

  it('resolves conflicts by confidence, then recency, then deterministic tie-break', async () => {
    const store = new InMemoryLibrarianStore()
    const high = makeEntry({ id: createArtifactId('high'), confidence: 0.9, createdAt: '2024-01-01T00:00:00.000Z' })
    const low = makeEntry({ id: createArtifactId('low'), confidence: 0.2, createdAt: '2025-01-01T00:00:00.000Z' })
    const newer = makeEntry({ id: createArtifactId('newer'), confidence: 0.5, createdAt: '2026-01-01T00:00:00.000Z' })
    const older = makeEntry({ id: createArtifactId('older'), confidence: 0.5, createdAt: '2025-01-01T00:00:00.000Z' })
    const tieA = makeEntry({ id: createArtifactId('a-tie'), confidence: 0.3, createdAt: '2026-01-01T00:00:00.000Z' })
    const tieB = makeEntry({ id: createArtifactId('b-tie'), confidence: 0.3, createdAt: '2026-01-01T00:00:00.000Z' })

    for (const entry of [high, low, newer, older, tieA, tieB]) {
      await store.save(entry)
    }

    const librarian = new Librarian(store)

    const byConfidence = await librarian.resolveConflict(high.id, low.id)
    expect(byConfidence.strategy).toBe('higher_confidence')
    expect(byConfidence.winnerId).toBe(high.id)

    const byRecency = await librarian.resolveConflict(newer.id, older.id)
    expect(byRecency.strategy).toBe('newer_entry')
    expect(byRecency.winnerId).toBe(newer.id)

    const byTie = await librarian.resolveConflict(tieA.id, tieB.id)
    expect(byTie.strategy).toBe('deterministic_tie_break')
  })
})
