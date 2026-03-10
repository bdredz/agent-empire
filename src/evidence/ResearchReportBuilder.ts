import type { AtomicClaim, EvidenceRecord, ResearchReport } from './types.js'
import type { CitationBundle } from './CitationCompiler.js'

export interface ReportBuilderInput {
    question: string
    claims: AtomicClaim[]
    evidence: EvidenceRecord[]
    citationBundle: CitationBundle
    tenantId: string
}

export class ResearchReportBuilder {
    build(input: ReportBuilderInput): ResearchReport {
        if (!input.claims.length || !input.evidence.length) {
            return {
                question: input.question,
                answer: 'Insufficient evidence to answer the question.',
                claims: [],
                evidenceIds: [],
                freshnessDate: new Date().toISOString(),
                confidence: 0,
                gaps: ['No evidence found to support any claims.'],
                recommendedNextAction: 'Expand search parameters or change source policy to find evidence.'
            }
        }

        let avgConfidence = 0
        let minDateMs = Number.MAX_SAFE_INTEGER
        let minDateStr = new Date().toISOString()

        for (const ev of input.evidence) {
            const dateStr = ev.publishedTimestamp || ev.fetchTimestamp
            const ms = new Date(dateStr).getTime()
            if (ms < minDateMs) {
                minDateMs = ms
                minDateStr = dateStr
            }
        }

        const citMap = new Map<string, string>()
        for (const c of input.citationBundle.citations) {
            citMap.set(c.claimId, c.inlineText)
        }

        const sortedClaims = [...input.claims].sort((a, b) => b.confidenceScore - a.confidenceScore)
        const sentences: string[] = []

        for (const claim of sortedClaims) {
            const inline = citMap.get(claim.claimId) || ''
            sentences.push(`${claim.statement} ${inline}`.trim())
            avgConfidence += claim.confidenceScore
        }
        avgConfidence = Number((avgConfidence / sortedClaims.length).toFixed(3))

        const gaps: string[] = []
        if (sortedClaims.length < 3) {
            gaps.push('Limited claims extracted. Answer may lack depth.')
        }
        if (avgConfidence < 0.6) {
            gaps.push('Evidence confidence is low across collected sources.')
        }

        let recommendedNextAction: string | undefined
        if (gaps.length > 0) {
            recommendedNextAction = 'Gather more authoritative or recent sources.'
        }

        const answerBody = sentences.join(' ')
        const answer = input.citationBundle.markdown
            ? `${answerBody}\n\n${input.citationBundle.markdown}`
            : answerBody

        return {
            question: input.question,
            answer,
            claims: sortedClaims,
            evidenceIds: Array.from(new Set(input.evidence.map((e) => e.evidenceId))),
            freshnessDate: minDateStr,
            confidence: avgConfidence,
            gaps,
            recommendedNextAction
        }
    }
}
