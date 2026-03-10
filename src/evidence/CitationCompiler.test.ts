import { describe, it, expect } from 'vitest'
import { CitationCompiler } from './CitationCompiler.js'
import type { AtomicClaim, EvidenceRecord } from '@shared/types.js'

describe('CitationCompiler', () => {
    const compiler = new CitationCompiler()

    it('handles empty claims gracefully', () => {
        const result = compiler.compile([], [])
        expect(result.citations).toEqual([])
        expect(result.bibliography).toEqual([])
        expect(result.markdown).toBe('')
    })

    it('generates a single citation for a single claim and evidence', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'Statement 1', confidence: 0.9, extractedAt: '2026-03-01T12:00:00Z' }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'https://nasa.gov/mars', sourceType: 'webpage', contentHash: 'h1', fetchedAt: '2026-03-01T12:00:00Z', trustScore: 1.0, freshnessScore: 1.0, publishedAt: '2026-02-01T10:00:00Z' }
        ]

        const result = compiler.compile(claims, evidence)

        expect(result.bibliography.length).toBe(1)
        expect(result.citations.length).toBe(1)
        expect(result.citations[0]!.inlineText).toBe('[1]')
        expect(result.bibliography[0]!.sourceUrl).toBe('https://nasa.gov/mars')
    })

    it('deduplicates bibliography entries when multiple claims come from the same source', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'Stmt 1', confidence: 0.9, extractedAt: '2026-03-01T12:00:00Z' },
            { claimId: 'c2' as AtomicClaim['claimId'], evidenceId: 'e2' as AtomicClaim['evidenceId'], statement: 'Stmt 2', confidence: 0.8, extractedAt: '2026-03-01T12:00:00Z' } // different evidence but same source
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'https://same.com/doc', sourceType: 'webpage', contentHash: 'h1', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 },
            { evidenceId: 'e2' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'https://same.com/doc', sourceType: 'webpage', contentHash: 'h2', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 }
        ]

        const result = compiler.compile(claims, evidence)

        expect(result.bibliography.length).toBe(1) // deduced
        expect(result.citations.length).toBe(2)
        // both should point to [1]
        expect(result.citations[0]!.inlineText).toBe('[1]')
        expect(result.citations[1]!.inlineText).toBe('[1]')
        expect(result.citations[0]!.bibliographyId).toBe(result.citations[1]!.bibliographyId)
    })

    it('handles missing published dates correctly', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'St', confidence: 0, extractedAt: '2026-03-01T12:00:00Z' }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'https://nodate.com', sourceType: 'webpage', contentHash: 'h1', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 }
            // no publishedAt
        ]

        const result = compiler.compile(claims, evidence)
        expect(result.bibliography[0]!.publishedAt).toBeUndefined()
        expect(result.markdown).not.toContain('undefined')
        expect(result.markdown).toContain('nodate.com')
    })

    it('formats bibliography correctly ensuring predictable ordering', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'St 1', confidence: 0, extractedAt: '2026-03-01T12:00:00Z' },
            { claimId: 'c2' as AtomicClaim['claimId'], evidenceId: 'e2' as AtomicClaim['evidenceId'], statement: 'St 2', confidence: 0, extractedAt: '2026-03-01T12:00:00Z' }
        ]
        // a.com goes before z.com
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'https://z.com', sourceType: 'webpage', contentHash: 'h1', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 },
            { evidenceId: 'e2' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'https://a.com', sourceType: 'webpage', contentHash: 'h2', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 }
        ]

        const result = compiler.compile(claims, evidence)
        expect(result.bibliography.length).toBe(2)
        expect(result.bibliography[0]!.sourceUrl).toBe('https://a.com') // alphabetical
        expect(result.bibliography[1]!.sourceUrl).toBe('https://z.com')
    })

    it('generates well-formed markdown output', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'St', confidence: 0, extractedAt: '2026-03-01T12:00:00Z' }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'https://nasa.gov/mars', sourceType: 'webpage', contentHash: 'h1', fetchedAt: '2026', trustScore: 1, freshnessScore: 1, publishedAt: '2026-02-01' }
        ]

        const result = compiler.compile(claims, evidence)
        expect(result.markdown).toContain('### Bibliography')
        expect(result.markdown).toContain('[1]')
        expect(result.markdown).toContain('nasa.gov')
        expect(result.markdown).toContain('(2026-02-01)')
        expect(result.markdown).toContain('- https://nasa.gov/mars')
    })
})
