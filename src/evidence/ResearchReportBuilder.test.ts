import { describe, it, expect } from 'vitest'
import { ResearchReportBuilder } from './ResearchReportBuilder.js'
import type { AtomicClaim, EvidenceRecord } from './types.js'
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
    })

    it('aggregates confidence across claims effectively', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1', evidenceId: 'e1', statement: 'St 1', confidenceScore: 1.0 },
            { claimId: 'c2', evidenceId: 'e1', statement: 'St 2', confidenceScore: 0.5 },
            { claimId: 'c3', evidenceId: 'e1', statement: 'St 3', confidenceScore: 0.6 }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1', tenantId: 't1', sourceUrl: 'u', contentHash: 'h', fetchTimestamp: '2026', trustScore: 1, freshnessScore: 1 }
        ]
        const citationBundle: CitationBundle = { citations: [], bibliography: [], markdown: '' }

        const result = builder.build({ question: 'Q', claims, evidence, citationBundle, tenantId: 't1' })
        expect(result.confidence).toBeCloseTo(0.7) // (1.0 + 0.5 + 0.6) / 3 = 0.7
    })

    it('determines the oldest freshness date correctly preferring publishedTimestamp', () => {
        const claims: AtomicClaim[] = [{ claimId: 'c1', evidenceId: 'e1', statement: 'St 1', confidenceScore: 1.0 }]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1', tenantId: 't1', sourceUrl: 'u', contentHash: 'h', fetchTimestamp: '2026-03-05T00:00:00Z', trustScore: 1, freshnessScore: 1 },
            { evidenceId: 'e2', tenantId: 't1', sourceUrl: 'v', contentHash: 'i', fetchTimestamp: '2026-03-02T00:00:00Z', publishedTimestamp: '2026-01-15T00:00:00Z', trustScore: 1, freshnessScore: 1 }
        ]

        const result = builder.build({ question: 'Q', claims, evidence, citationBundle: { citations: [], bibliography: [], markdown: '' }, tenantId: 't1' })
        expect(result.freshnessDate).toBe('2026-01-15T00:00:00Z')
    })

    it('identifies gaps when confidence is low or claims are few', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1', evidenceId: 'e1', statement: 'St 1', confidenceScore: 0.3 }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1', tenantId: 't1', sourceUrl: 'u', contentHash: 'h', fetchTimestamp: '2026', trustScore: 1, freshnessScore: 1 }
        ]

        const result = builder.build({ question: 'Q', claims, evidence, citationBundle: { citations: [], bibliography: [], markdown: '' }, tenantId: 't1' })
        expect(result.gaps).toContain('Limited claims extracted. Answer may lack depth.')
        expect(result.gaps).toContain('Evidence confidence is low across collected sources.')
        expect(result.recommendedNextAction).toBeDefined()
    })

    it('structures the synthesized answer and appends markdown bibliography', () => {
        const claims: AtomicClaim[] = [
            { claimId: 'c1', evidenceId: 'e1', statement: 'Fact A.', confidenceScore: 0.8 },
            { claimId: 'c2', evidenceId: 'e2', statement: 'Fact B.', confidenceScore: 0.9 } // Expected to sort first, higher conf
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e1', tenantId: 't1', sourceUrl: 'u', contentHash: '1', fetchTimestamp: '2026', trustScore: 1, freshnessScore: 1 },
            { evidenceId: 'e2', tenantId: 't1', sourceUrl: 'v', contentHash: '2', fetchTimestamp: '2026', trustScore: 1, freshnessScore: 1 }
        ]
        const citationBundle: CitationBundle = {
            citations: [
                { claimId: 'c1', bibliographyId: 'b1', inlineText: '[1]' },
                { claimId: 'c2', bibliographyId: 'b2', inlineText: '[2]' }
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
            { claimId: 'c1', evidenceId: 'e99', statement: 'St 1', confidenceScore: 0.9 }
        ]
        const evidence: EvidenceRecord[] = [
            { evidenceId: 'e99', tenantId: 't1', sourceUrl: 'u', contentHash: 'h', fetchTimestamp: '2026', trustScore: 1, freshnessScore: 1 }
        ]

        const result = builder.build({ question: 'Target Question?', claims, evidence, citationBundle: { citations: [], bibliography: [], markdown: '' }, tenantId: 't1' })
        expect(result.question).toBe('Target Question?')
        expect(result.evidenceIds).toEqual(['e99'])
    })
})
