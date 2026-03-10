import { randomUUID } from 'crypto'
import type { IResearchBroker } from './IResearchBroker.js'
import type { SourcePolicyEngine } from './SourcePolicyEngine.js'
import type { EvidenceStore } from './EvidenceStore.js'
import type { ClaimExtractor } from './ClaimExtractor.js'
import type { FreshnessScorer } from './FreshnessScorer.js'
import type { CitationCompiler } from './CitationCompiler.js'
import type { ResearchReportBuilder } from './ResearchReportBuilder.js'
import type { EvidenceRecord, ResearchReport } from '@shared/types.js'
import type { MemoryProposal } from '@shared/types.js'

export class ResearchBroker implements IResearchBroker {
    private memProposals: MemoryProposal[] = []

    constructor(
        private readonly sourcePolicyEngine: SourcePolicyEngine,
        private readonly evidenceStore: EvidenceStore,
        private readonly claimExtractor: ClaimExtractor,
        private readonly freshnessScorer: FreshnessScorer,
        private readonly citationCompiler: CitationCompiler,
        private readonly reportBuilder: ResearchReportBuilder,
        private readonly proposalSink?: (proposal: MemoryProposal) => void
    ) { }

    // For testing purposes
    getEmittedProposals(): MemoryProposal[] {
        return this.memProposals
    }

    async research(params: {
        question: string
        tenantId: string
        freshnessRequirement?: 'realtime' | 'recent' | 'any'
        maxSources?: number
        budgetTokens?: number
    }): Promise<ResearchReport> {
        if (params.budgetTokens !== undefined && params.budgetTokens < 10) {
            throw new Error('Budget exhausted: Insufficient tokens for research.')
        }

        const questionId = `q-${randomUUID().substring(0, 8)}`

        // 2. Apply SourcePolicyEngine (Simulating selection of sources)
        const simulatedUrls = [
            'https://authoritative.gov/simulated-data',
            'https://academic.edu/simulated-study',
            'https://news.com/simulated-article',
            'https://spam.com/fake'
        ]

        const validSources: { url: string; tier: 'tier_1' | 'tier_2' | 'tier_3' }[] = []

        for (const url of simulatedUrls) {
            const res = this.sourcePolicyEngine.evaluate({ url, questionType: params.freshnessRequirement })
            if (res.allowed) {
                validSources.push({ url, tier: res.tier as 'tier_1' | 'tier_2' | 'tier_3' })
            }
            if (validSources.length === (params.maxSources || 5)) break
        }

        // 4. Simulate evidence fetch and 5. Store raw evidence
        const nowTimestamp = new Date().toISOString()
        const fetchedEvidence: EvidenceRecord[] = []

        for (const source of validSources) {
            const dummyContent = `This is simulated evidence from ${source.url} answering: ${params.question}. According to authoritative data, 100% of these assertions are factual.`

            // 7. Score freshness
            const freshness = this.freshnessScorer.score({
                tier: source.tier,
                fetchedAt: nowTimestamp
            })

            // Store Evidence
            const stored = await this.evidenceStore.storeEvidence({
                questionId,
                tenantId: params.tenantId,
                sourceUrl: source.url,
                sourceType: 'webpage',
                fetchedAt: nowTimestamp,
                trustScore: source.tier === 'tier_1' ? 1.0 : (source.tier === 'tier_2' ? 0.8 : 0.5),
                freshnessScore: freshness.freshnessScore,
                rawContent: dummyContent
            })

            fetchedEvidence.push(stored)
        }

        // 6. Extract atomic claims
        const allClaims = []
        for (const ev of fetchedEvidence) {
            if (!ev.rawContent) continue
            const claims = this.claimExtractor.extractClaims(ev.evidenceId, ev.rawContent)
            allClaims.push(...claims)
        }

        // 8. Compile citations
        const citationBundle = this.citationCompiler.compile(allClaims, fetchedEvidence)

        // 9. Build ResearchReport
        const report = this.reportBuilder.build({
            question: params.question,
            claims: allClaims,
            evidence: fetchedEvidence,
            citationBundle,
            tenantId: params.tenantId
        })

        // 10. Emit MemoryProposal (NOT a direct Librarian write)
        if (report.claims.length > 0 && report.confidence > 0.5) {
            const proposal: MemoryProposal = {
                proposalId: `prop-${randomUUID().substring(0, 8)}`,
                tenantId: params.tenantId,
                sourceAgentId: 'ResearchBroker',
                title: `Research Output: ${params.question}`,
                rawContent: report.answer,
                summary: report.answer.substring(0, 100) + '...',
                tags: ['research'],
                confidence: report.confidence,
                kind: 'research_facts',
                createdAt: new Date().toISOString()
            }
            this.memProposals.push(proposal)
            if (this.proposalSink) {
                this.proposalSink(proposal)
            }
        }

        return report
    }

    async getEvidence(evidenceId: string, tenantId: string): Promise<EvidenceRecord | null> {
        return this.evidenceStore.getEvidence(evidenceId, tenantId)
    }

    async listEvidence(questionId: string, tenantId: string): Promise<EvidenceRecord[]> {
        return this.evidenceStore.listEvidenceByQuestion(questionId, tenantId)
    }
}
