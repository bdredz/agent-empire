import { describe, it, expect, beforeEach } from 'vitest'
import { EvidenceStore } from './EvidenceStore.js'
import { createHash } from 'crypto'

describe('EvidenceStore', () => {
    let store: EvidenceStore

    beforeEach(() => {
        store = new EvidenceStore()
    })

    it('stores evidence with rawContent and computes SHA-256 hash', async () => {
        const record = await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-default',
            sourceUrl: 'https://example.com/doc',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.9,
            freshnessScore: 1.0,
            rawContent: 'Sample document content'
        })

        expect(record.evidenceId).toBeDefined()
        const expectedHash = createHash('sha256').update('Sample document content').digest('hex')
        expect(record.contentHash).toBe(expectedHash)
    })

    it('retrieves evidence by ID with tenant isolation', async () => {
        const record = await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-default',
            sourceUrl: 'https://example.com/doc',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.9,
            freshnessScore: 1.0,
            rawContent: 'Content 1'
        })

        const found = await store.getEvidence(record.evidenceId, 'tenant-1')
        expect(found).toBeDefined()
        expect(found?.evidenceId).toBe(record.evidenceId)

        const notFound = await store.getEvidence(record.evidenceId, 'tenant-2')
        expect(notFound).toBeNull()
    })

    it('queries evidence by question ID', async () => {
        await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-1',
            sourceUrl: 'https://example.com/docs/1',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.9,
            freshnessScore: 1.0,
            rawContent: 'Content Q1-A'
        })

        await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-1',
            sourceUrl: 'https://example.com/docs/2',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.8,
            freshnessScore: 0.9,
            rawContent: 'Content Q1-B'
        })

        await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-2',
            sourceUrl: 'https://example.com/docs/3',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.5,
            freshnessScore: 0.4,
            rawContent: 'Content Q2'
        })

        const q1Results = await store.listEvidenceByQuestion('q-1', 'tenant-1')
        expect(q1Results.length).toBe(2)
        expect(q1Results.map(r => r.sourceUrl)).toContain('https://example.com/docs/1')
    })

    it('deduplicates by exact content hash and source url', async () => {
        const first = await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-default',
            sourceUrl: 'https://example.com/dup',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.9,
            freshnessScore: 1.0,
            rawContent: 'Same strict content'
        })

        const second = await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-default',
            sourceUrl: 'https://example.com/dup',
            sourceType: 'webpage',
            fetchedAt: '2026-03-02T12:00:00Z', // fetched later
            trustScore: 0.9,
            freshnessScore: 0.9,
            rawContent: 'Same strict content'
        })

        expect(second.evidenceId).toBe(first.evidenceId) // dedup returned original
    })

    it('preserves freshness score assignment strictly', async () => {
        const record = await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-default',
            sourceUrl: 'https://example.com/doc',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.9,
            freshnessScore: 0.73,
            contentHash: 'some-hash'
        })

        expect(record.freshnessScore).toBe(0.73)
    })

    it('preserves trust score from source tier strictly', async () => {
        const record = await store.storeEvidence({
            tenantId: 'tenant-1',
            questionId: 'q-default',
            sourceUrl: 'https://example.com/doc',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.88,
            freshnessScore: 0.9,
            contentHash: 'some-hash2'
        })

        expect(record.trustScore).toBe(0.88)
    })

    it('lists evidence by source URL', async () => {
        await store.storeEvidence({
            tenantId: 'tenant-X',
            questionId: 'q-default',
            sourceUrl: 'https://mysite.com/article',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 0.8,
            freshnessScore: 0.5,
            contentHash: 'hash-a'
        })

        await store.storeEvidence({
            tenantId: 'tenant-X',
            questionId: 'q-default',
            sourceUrl: 'https://mysite.com/article',
            sourceType: 'webpage',
            fetchedAt: '2026-03-02T12:00:00Z',
            trustScore: 0.8,
            freshnessScore: 0.8,
            contentHash: 'hash-b' // changed content doesn't dedup
        })

        const results = await store.listEvidenceBySource('https://mysite.com/article', 'tenant-X')
        expect(results.length).toBe(2)
    })

    it('enforces tenant isolation entirely across all operations', async () => {
        const record = await store.storeEvidence({
            tenantId: 'tenant-A',
            questionId: 'q-iso',
            sourceUrl: 'https://mysite.com/iso',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 1.0,
            freshnessScore: 1.0,
            contentHash: 'iso-hash'
        })

        const listByQ = await store.listEvidenceByQuestion('q-iso', 'tenant-B')
        expect(listByQ.length).toBe(0)

        const listByS = await store.listEvidenceBySource('https://mysite.com/iso', 'tenant-B')
        expect(listByS.length).toBe(0)

        // dedup shouldn't trigger across tenants
        const record2 = await store.storeEvidence({
            tenantId: 'tenant-B',
            questionId: 'q-iso',
            sourceUrl: 'https://mysite.com/iso',
            sourceType: 'webpage',
            fetchedAt: '2026-03-01T12:00:00Z',
            trustScore: 1.0,
            freshnessScore: 1.0,
            contentHash: 'iso-hash'
        })

        expect(record2.evidenceId).not.toBe(record.evidenceId)
    })
})
