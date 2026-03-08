export interface SecretFinding {
    readonly type: 'pattern' | 'entropy'
    readonly match: string
    readonly confidence: number // 0.0 - 1.0
    readonly startIndex: number
    readonly endIndex: number
}

export interface ISecretLeakScanner {
    scan(text: string): SecretFinding[]
}

export class SecretLeakScanner implements ISecretLeakScanner {
    private readonly rules = [
        { name: 'API Key', regex: /sk-[a-zA-Z0-9]{20,}/g, confidence: 0.99 },
        { name: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}/g, confidence: 0.99 },
        { name: 'Password Assignment', regex: /password\s*=\s*['"][^\s'"]+['"]/gi, confidence: 0.8 },
        { name: 'Bearer Token', regex: /Bearer\s+[a-zA-Z0-9\-\._~+\/]+=*/g, confidence: 0.9 },
        { name: 'Database Connection String', regex: /(postgres|mysql|mongodb(?:\\+srv)?):\/\/[^\s]+:[^\s]+@[^\s]+\.[^\s]+/gi, confidence: 0.9 }
    ]

    public scan(text: string): SecretFinding[] {
        const findings: SecretFinding[] = []

        if (!text || typeof text !== 'string') {
            return findings
        }

        // 1. Pattern-based detection
        for (const rule of this.rules) {
            let match: RegExpExecArray | null
            while ((match = rule.regex.exec(text)) !== null) {
                findings.push({
                    type: 'pattern',
                    match: match[0],
                    confidence: rule.confidence,
                    startIndex: match.index,
                    endIndex: match.index + match[0].length
                })
            }
        }

        // 2. Entropy-based detection (simple implementation)
        // Find long "random" looking alphanumeric strings
        const entropyRegex = /\b[a-zA-Z0-9]{20,64}\b/g
        let match: RegExpExecArray | null
        while ((match = entropyRegex.exec(text)) !== null) {
            const candidateFn = match[0]
            if (this.calculateEntropy(candidateFn) > 4.5 && !candidateFn.match(/^[a-z]+$/) && !candidateFn.match(/^[0-9]+$/)) {
                // If a pattern already matched this exact string, skip to avoid duplicates
                const isDuplicate = findings.some(f =>
                    f.startIndex <= match!.index && f.endIndex >= match!.index + candidateFn.length
                )

                if (!isDuplicate) {
                    findings.push({
                        type: 'entropy',
                        match: candidateFn,
                        confidence: 0.7, // Lower confidence for entropy match
                        startIndex: match.index,
                        endIndex: match.index + candidateFn.length
                    })
                }
            }
        }

        return findings.sort((a, b) => a.startIndex - b.startIndex)
    }

    private calculateEntropy(str: string): number {
        const counts = new Map<string, number>()
        for (const char of str) {
            counts.set(char, (counts.get(char) || 0) + 1)
        }

        let entropy = 0
        for (const count of counts.values()) {
            const p = count / str.length
            entropy -= p * Math.log2(p)
        }
        return entropy
    }
}
