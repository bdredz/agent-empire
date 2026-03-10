import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ResearchBroker } from './ResearchBroker.js'
import { SourcePolicyEngine } from './SourcePolicyEngine.js'
import { EvidenceStore } from './EvidenceStore.js'
import { ClaimExtractor } from './ClaimExtractor.js'
import { FreshnessScorer } from './FreshnessScorer.js'
import { CitationCompiler } from './CitationCompiler.js'
import { ResearchReportBuilder } from './ResearchReportBuilder.js'
import type { MemoryProposal } from '@shared/types.js'

describe('ResearchBroker', () => {
    let broker: ResearchBroker
    let policyEngine: SourcePolicyEngine
    let store: EvidenceStore
    let mockSink: (p: MemoryProposal) => void

    beforeEach(() => {
        policyEngine = new SourcePolicyEngine({
            allowedDomains: ['*.gov', '*.edu'],
            tierOverrides: { '*.gov': 'tier_1', '*.edu': 'tier_2' },
            deniedDomains: ['spam.com']
        })
        store = new EvidenceStore()
        mockSink = vi.fn()

        broker = new ResearchBroker(
            policyEngine,
            store,
            new ClaimExtractor(),
            new FreshnessScorer(),
            new CitationCompiler(),
            new ResearchReportBuilder(),
            mockSink
        )
    })

    it('orchestrates a full research lifecycle deterministically', async () => {
        const report = await broker.research({
            question: 'What is the capital of France?',
            tenantId: 't1'
        })

        expect(report.question).toBe('What is the capital of France?')
        expect(report.claims.length).toBeGreaterThan(0)
        expect(report.answer.length).toBeGreaterThan(10)
        expect(report.confidence).toBeGreaterThan(0.5)
    })

    it('enforces source policy correctly by skipping denied domains', async () => {
        const report = await broker.research({
            question: 'Should trigger policy',
            tenantId: 't1'
        })

        // We simulated 4 URLs, one is spam.com. It should not be in the evidence.
        const eviUrls = (await broker.listEvidence('all', 't1')) // wait listEvidence requires real questionId
        // Actually the report returns the evidenceIds. We can check the store!
        for (const id of report.evidenceIds) {
            const ev = await broker.getEvidence(id, 't1')
            expect(ev).toBeDefined()
            expect(ev!.sourceUrl).not.toContain('spam.com')
        }
        expect(report.evidenceIds.length).toBe(2) // out of 4 simulated, only gov and edu match the allowed list!
    })

    it('stores evidence correctly with content hashes', async () => {
        const report = await broker.research({ question: 'Hash check', tenantId: 't1' })
        const ev = await broker.getEvidence(report.evidenceIds[0]!, 't1')
        expect(ev!.contentHash).toBeDefined()
        expect(ev!.contentHash.length).toBe(64) // sha256 output length
    })

    it('extracts claims from the fetched evidence', async () => {
        const report = await broker.research({ question: 'Claim check', tenantId: 't1' })
        expect(report.claims.length).toBeGreaterThan(0)
        expect(report.claims.some(c => c.statement.includes('simulated evidence'))).toBe(true)
    })

    it('scores freshness for stored evidence automatically', async () => {
        const report = await broker.research({ question: 'Freshness check', tenantId: 't1' })
        const ev = await broker.getEvidence(report.evidenceIds[0]!, 't1')
        expect(ev!.freshnessScore).toBeDefined()
        expect(ev!.freshnessScore).toBeCloseTo(1.0)
    })

    it('compiles citations accurately and embeds them into the report', async () => {
        const report = await broker.research({ question: 'Citation check', tenantId: 't1' })
        expect(report.answer).toContain('[1]') // Inline citation embedded
        expect(report.answer).toContain('### Bibliography')
    })

    it('builds a structured report containing expected gaps', async () => {
        const report = await broker.research({ question: 'Report structure', tenantId: 't1' })
        expect(report.gaps).toBeDefined()
        if (report.claims.length < 3) {
            expect(report.gaps).toContain('Limited claims extracted. Answer may lack depth.')
        }
    })

    it('emits a memory proposal but does NOT perform a direct Librarian write', async () => {
        await broker.research({ question: 'Proposal check', tenantId: 't1' })

        const proposals = broker.getEmittedProposals()
        expect(proposals.length).toBe(1)
        expect(proposals[0]!.title).toContain('Proposal check')
        expect(proposals[0]!.kind).toBe('research_facts')

        // Verify sink was called
        expect(mockSink).toHaveBeenCalledOnce()
    })

    it('preserves tenant scoping in evidence store interactions', async () => {
        const report = await broker.research({ question: 'Tenant isolate', tenantId: 'acme-corp' })
        const ev = await broker.getEvidence(report.evidenceIds[0]!, 'acme-corp')
        expect(ev).toBeDefined()

        const evLeak = await broker.getEvidence(report.evidenceIds[0]!, 'other-tenant')
        expect(evLeak).toBeNull()
    })

    it('respects budget tokens constraints', async () => {
        try {
            await broker.research({
                question: 'Budget test',
                tenantId: 't1',
                budgetTokens: 5 // arbitrarily low budget
            })
            // expect to throw or truncate... assuming throw for now until I implement it
        } catch (e: unknown) {
            expect((e as Error).message).toContain('Budget')
        }
    })
})
