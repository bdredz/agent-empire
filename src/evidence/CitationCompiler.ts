import { randomUUID } from 'crypto'
import type { AtomicClaim, EvidenceRecord, Citation, BibliographyEntry } from '@shared/types.js'

export interface CitationBundle {
    citations: Citation[]
    bibliography: BibliographyEntry[]
    markdown: string
}

export class CitationCompiler {
    compile(claims: AtomicClaim[], evidence: EvidenceRecord[]): CitationBundle {
        if (!claims.length) {
            return { citations: [], bibliography: [], markdown: '' }
        }

        const evidenceMap = new Map<string, EvidenceRecord>()
        for (const ev of evidence) {
            evidenceMap.set(ev.evidenceId, ev)
        }

        const bibMap = new Map<string, BibliographyEntry>() // sourceUrl -> Entry
        const bibliography: BibliographyEntry[] = []
        const citations: Citation[] = []

        for (const claim of claims) {
            const ev = evidenceMap.get(claim.evidenceId)
            if (!ev) continue

            let bibEntry = bibMap.get(ev.sourceUrl)
            if (!bibEntry) {
                let title = ev.sourceUrl
                try {
                    title = new URL(ev.sourceUrl).hostname
                } catch {
                    // ignore
                }

                bibEntry = {
                    bibliographyId: `bib-${randomUUID().substring(0, 8)}`,
                    sourceUrl: ev.sourceUrl,
                    title,
                    publishedAt: ev.publishedAt
                }
                bibMap.set(ev.sourceUrl, bibEntry)
                bibliography.push(bibEntry)
            }
        }

        // Sort bibliography alphabetically by source URL so numbering is consistent
        bibliography.sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl))

        for (const claim of claims) {
            const ev = evidenceMap.get(claim.evidenceId)
            if (!ev) continue

            const bibEntry = bibMap.get(ev.sourceUrl)!
            const index = bibliography.findIndex((b) => b.bibliographyId === bibEntry.bibliographyId) + 1

            const inlineText = `[${index}]`

            citations.push({
                claimId: claim.claimId,
                bibliographyId: bibEntry.bibliographyId,
                inlineText
            })
        }

        let markdown = '### Bibliography\n\n'
        for (let i = 0; i < bibliography.length; i++) {
            const bRef = bibliography[i] as BibliographyEntry
            const dateStr = bRef.publishedAt ? ` (${bRef.publishedAt})` : ''
            markdown += `[${i + 1}] ${bRef.title}${dateStr} - ${bRef.sourceUrl}\n`
        }

        return {
            citations,
            bibliography,
            markdown: markdown.trim()
        }
    }
}
