import { describe, it, expect, beforeEach } from 'vitest'
import { SecretLeakScanner } from './SecretLeakScanner'

describe('SecretLeakScanner', () => {
    let scanner: SecretLeakScanner

    beforeEach(() => {
        scanner = new SecretLeakScanner()
    })

    it('detects API key pattern (Anthropic style sk-)', () => {
        const text = 'Here is your key: sk-antbabcdefghijklmnopqrstuvwxyz1234567890 please keep it safe.'
        const findings = scanner.scan(text)
        expect(findings.length).toBeGreaterThanOrEqual(1)
        expect(findings[0]!.type).toBe('pattern')
        expect(findings[0]!.match).toContain('sk-')
        expect(findings[0]!.confidence).toBeGreaterThan(0.9)
    })

    it('detects high-entropy string', () => {
        const highEntropy = 'aB3cD4eF5gH6iJ7kL8mN9oP0qR1s'
        const text = `This could be a token: ${highEntropy}`
        const findings = scanner.scan(text)

        // Pattern matches won't catch this, but entropy should
        const entropyFindings = findings.filter(f => f.type === 'entropy')
        expect(entropyFindings.length).toBe(1)
        expect(entropyFindings[0]!.match).toBe(highEntropy)
    })

    it('clean text passes without findings', () => {
        const text = 'This is a completely normal sentence describing a completely normal process. No secrets here.'
        const findings = scanner.scan(text)
        expect(findings).toHaveLength(0)
    })

    it('handles mixed content with secrets', () => {
        const text = `
      To connect to the database, use:
      postgres://admin:secretKey123@db.example.com/main
      
      And for API use Bearer abcdef1234567890ABCDEF
    `
        const findings = scanner.scan(text)
        expect(findings.length).toBe(2)
        const matches = findings.map(f => f.match)
        expect(matches[0]).toContain('postgres://')
        expect(matches[1]).toContain('Bearer abcdef')
    })

    it('detects multiple different secrets', () => {
        const text = 'sk-xyz123xyz123xyz123xyz123 and ghp_abc123abc123abc123abc123abc123abc123'
        const findings = scanner.scan(text)
        expect(findings.length).toBe(2)
        expect(findings[0]!.match).toContain('sk-')
        expect(findings[1]!.match).toContain('ghp_')
    })

    it('is resistant to false positives (low entropy dictionary words)', () => {
        const text = 'supercalifragilisticexpialidocious is a very long word but it is not a secret key'
        const findings = scanner.scan(text)
        expect(findings).toHaveLength(0) // Entropy should be low, and dictionary word shouldn't match regex
    })
})
