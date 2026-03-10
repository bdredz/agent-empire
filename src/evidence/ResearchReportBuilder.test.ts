import { describe, it, expect } from 'vitest'
import { ResearchReportBuilder } from './ResearchReportBuilder.js'
import type { AtomicClaim, EvidenceRecord } from '@shared/types.js'
import type { CitationBundle } from './CitationCompiler.js'

describe('ResearchReportBuilder', () => {
    const builder = new ResearchReportBuilder()

    it('handles empty claims yielding generic fallback structure', () => {
        const result = builder.build({
            question: 'What is X?',
            claims: [],
            evidence: [],
            citationBundle: { citations: [], bibliography: [], markdown: '' },
            tenantId: 't1'
        })

        expect(result.answer).toContain('Insufficient evidence')
        expect(result.claims).toEqual([])
        expect(result.evidenceIds).toEqual([])
        expect(result.confidence).toBe(0)
        expect(result.gaps).toContain('No evidence found to support any claims.')
        expect(result.reportId).toBeDefined()
        expect(result.tenantId).toBe('t1')
    })

    it('aggregates confidence across claims effectively', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'St 1', confidence: 1.0, extractedAt: '2026-03-01T12:00:00Z' },
            { claimId: 'c2' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'St 2', confidence: 0.5, extractedAt: '2026-03-01T12:00:00Z' },
            { claimId: 'c3' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'St 3', confidence: 0.6, extractedAt: '2026-03-01T12:00:00Z' }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'u', sourceType: 'webpage', contentHash: 'h', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 }
        ]
        const citationBundle: CitationBundle = { citations: [], bibliography: [], markdown: '' }

        const result = builder.build({ question: 'Q', claims, evidence, citationBundle, tenantId: 't1' })
        expect(result.confidence).toBeCloseTo(0.7) // (1.0 + 0.5 + 0.6) / 3 = 0.7
    })

    it('determines the oldest freshness date correctly preferring publishedAt', () => {
        const claims: AtomicClaim[] = [{ claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'St 1', confidence: 1.0, extractedAt: '2026-03-01T12:00:00Z' }]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'u', sourceType: 'webpage', contentHash: 'h', fetchedAt: '2026-03-05T00:00:00Z', trustScore: 1, freshnessScore: 1 },
            { evidenceId: 'e2' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'v', sourceType: 'webpage', contentHash: 'i', fetchedAt: '2026-03-02T00:00:00Z', publishedAt: '2026-01-15T00:00:00Z', trustScore: 1, freshnessScore: 1 }
        ]

        const result = builder.build({ question: 'Q', claims, evidence, citationBundle: { citations: [], bibliography: [], markdown: '' }, tenantId: 't1' })
        expect(result.freshnessDate).toBe('2026-01-15T00:00:00Z')
    })

    it('identifies gaps when confidence is low or claims are few', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'St 1', confidence: 0.3, extractedAt: '2026-03-01T12:00:00Z' }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'u', sourceType: 'webpage', contentHash: 'h', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 }
        ]

        const result = builder.build({ question: 'Q', claims, evidence, citationBundle: { citations: [], bibliography: [], markdown: '' }, tenantId: 't1' })
        expect(result.gaps).toContain('Limited claims extracted. Answer may lack depth.')
        expect(result.gaps).toContain('Evidence confidence is low across collected sources.')
        expect(result.recommendedNextAction).toBeDefined()
    })

    it('structures the synthesized answer and appends markdown bibliography', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e1' as AtomicClaim['evidenceId'], statement: 'Fact A.', confidence: 0.8, extractedAt: '2026-03-01T12:00:00Z' },
            { claimId: 'c2' as AtomicClaim['claimId'], evidenceId: 'e2' as AtomicClaim['evidenceId'], statement: 'Fact B.', confidence: 0.9, extractedAt: '2026-03-01T12:00:00Z' } // Expected to sort first, higher conf
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'u', sourceType: 'webpage', contentHash: '1', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 },
            { evidenceId: 'e2' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'v', sourceType: 'webpage', contentHash: '2', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 }
        ]
        const citationBundle: CitationBundle = {
            citations: [
                { claimId: 'c1' as AtomicClaim['claimId'], bibliographyId: 'b1', inlineText: '[1]' },
                { claimId: 'c2' as AtomicClaim['claimId'], bibliographyId: 'b2', inlineText: '[2]' }
            ],
            bibliography: [],
            markdown: '### Bibliography\n[1] u\n[2] v'
        }

        const result = builder.build({ question: 'Q', claims, evidence, citationBundle, tenantId: 't1' })
        expect(result.answer).toContain('Fact B. [2] Fact A. [1]')
        expect(result.answer).toContain('### Bibliography')
    })

    it('preserves the original question and tracks evidence IDs', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1' as AtomicClaim['claimId'], evidenceId: 'e99' as AtomicClaim['evidenceId'], statement: 'St 1', confidence: 0.9, extractedAt: '2026-03-01T12:00:00Z' }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e99' as EvidenceRecord['evidenceId'], tenantId: 't1', questionId: 'q1', sourceUrl: 'u', sourceType: 'webpage', contentHash: 'h', fetchedAt: '2026', trustScore: 1, freshnessScore: 1 }
        ]

        const result = builder.build({ question: 'Target Question?', claims, evidence, citationBundle: { citations: [], bibliography: [], markdown: '' }, tenantId: 't1' })
        expect(result.question).toBe('Target Question?')
        expect(result.evidenceIds).toEqual(['e99'])
    })
})
