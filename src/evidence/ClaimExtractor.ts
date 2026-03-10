import { randomUUID } from 'crypto'
import type { AtomicClaim } from '@shared/types.js'
import { createClaimId, createEvidenceId } from '@shared/types.js'

export class ClaimExtractor {
    extractClaims(evidenceId: string, rawContent: string): AtomicClaim[] {
        if (!rawContent || rawContent.trim() === '') {
            return []
        }

        // Split into sentences (basic regex for English sentences)
        const sentences = rawContent
            .replace(/\n/g, ' ')
            .split(/(?<=[.?!])\s+(?=[A-Z0-9"])/)
            .map((s) => s.trim())
            .filter((s) => s.length > 5)

        const claims: AtomicClaim[] = []

        for (let sentence of sentences) {
            // Long content truncation
            if (sentence.length > 500) {
                sentence = sentence.substring(0, 497) + '...'
            }

            // Filter out questions
            if (sentence.endsWith('?')) continue

            const lower = sentence.toLowerCase()

            // Filter opinions and subjective terms without direct backing
            if (
                lower.startsWith('i think') ||
                lower.startsWith('i believe') ||
                lower.startsWith('in my opinion') ||
                lower.includes('probably') ||
                lower.includes('maybe') ||
                lower.includes('we feel')
            ) {
                continue
            }

            // Filter meta-statements (navigation, document refs)
            if (
                lower.includes('this article') ||
                lower.includes('this document') ||
                lower.includes('click here') ||
                lower.includes('read more') ||
                lower.includes('subscribe to')
            ) {
                continue
            }

            // Confidence scoring heuristic (0-1)
            let score = 0.7 // Base factual assertion confidence

            // Numbers/data boost confidence
            if (/\d/.test(sentence)) {
                score += 0.15
            }

            // Citational language boosts confidence
            if (lower.includes('according to') || lower.includes('study') || lower.includes('proven') || lower.includes('reports')) {
                score += 0.15
            }

            if (score > 1.0) score = 1.0

            claims.push({
                claimId: createClaimId(randomUUID()),
                evidenceId: createEvidenceId(evidenceId),
                statement: sentence,
                confidence: Number(score.toFixed(2)),
                extractedAt: new Date().toISOString()
            })
        }

        return claims
    }
}
