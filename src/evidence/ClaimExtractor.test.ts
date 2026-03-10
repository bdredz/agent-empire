import { describe, it, expect } from 'vitest'
import { ClaimExtractor } from './ClaimExtractor.js'

describe('ClaimExtractor', () => {
    const extractor = new ClaimExtractor()

    it('extracts a single claim correctly', () => {
        const claims = extractor.extractClaims('ev-1', 'The Earth revolves around the Sun.')
        expect(claims.length).toBe(1)
        expect(claims[0]!.evidenceId).toBe('ev-1')
        expect(claims[0]!.statement).toBe('The Earth revolves around the Sun.')
    })

    it('extracts multiple claims by splitting sentences deterministically', () => {
        const claims = extractor.extractClaims('ev-1', 'First sentence here. Second sentence starts.')
        expect(claims.length).toBe(2)
        expect(claims[0]!.statement).toBe('First sentence here.')
        expect(claims[1]!.statement).toBe('Second sentence starts.')
    })

    it('assigns confidence scoring properly based on heuristics', () => {
        // base score (0.7)
        const base = extractor.extractClaims('ev-1', 'The sky is blue.')[0]
        expect(base!.confidenceScore).toBeCloseTo(0.7)

        // number boost (+0.15)
        const numberBoost = extractor.extractClaims('ev-1', 'There are 8 planets in our solar system.')[0]
        expect(numberBoost!.confidenceScore).toBeCloseTo(0.85)

        // citation boost (+0.15)
        // according to adds 0.15, numbers 0.15 -> 1.0
        const citBoost = extractor.extractClaims('ev-1', 'According to NASA, there are 8 planets.')[0]
        expect(citBoost!.confidenceScore).toBeCloseTo(1.0)
    })

    it('filters out questions', () => {
        const claims = extractor.extractClaims('ev-1', 'What is the speed of light? It is roughly 3e8 m/s.')
        expect(claims.length).toBe(1)
        expect(claims[0]!.statement).toBe('It is roughly 3e8 m/s.')
    })

    it('filters out opinions without evidence based on subjective keywords', () => {
        const text = 'I think it is raining. I believe we will win. The score is 5 to 0.'
        const claims = extractor.extractClaims('ev-1', text)
        expect(claims.length).toBe(1)
        expect(claims[0]!.statement).toBe('The score is 5 to 0.')
    })

    it('filters out meta-statements and navigation text', () => {
        const text = 'Click here to subscribe to our newsletter. The capital of France is Paris.'
        const claims = extractor.extractClaims('ev-1', text)
        expect(claims.length).toBe(1)
        expect(claims[0]!.statement).toBe('The capital of France is Paris.')
    })

    it('returns empty array when content is empty or only whitespace', () => {
        expect(extractor.extractClaims('ev-1', '')).toEqual([])
        expect(extractor.extractClaims('ev-1', '   \n  ')).toEqual([])
    })

    it('truncates very long content (sentences over 500 characters)', () => {
        const longSentence = 'A'.repeat(600) + '.'
        const claims = extractor.extractClaims('ev-1', longSentence)
        expect(claims.length).toBe(1)
        expect(claims[0]!.statement).toHaveLength(500)
        expect(claims[0]!.statement.endsWith('...')).toBe(true)
    })

    it('links all extracted claims to target evidence ID uniquely', () => {
        const claims = extractor.extractClaims('ev-unique', 'The first sentence is long enough. The second sentence is also long enough. And the third sentence is long enough.')
        expect(claims.every(c => c.evidenceId === 'ev-unique')).toBe(true)
        const ids = new Set(claims.map(c => c.claimId))
        expect(ids.size).toBe(3) // claim IDs should be distinct
    })
})
