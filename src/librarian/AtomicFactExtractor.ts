export interface AtomicFact {
  fact: string
  confidence: number
}

export interface AtomicFactExtractorOptions {
  maxFacts: number
  minFactLength: number
}

const DEFAULT_OPTIONS: AtomicFactExtractorOptions = {
  maxFacts: 20,
  minFactLength: 8,
}

export class AtomicFactExtractor {
  private readonly options: AtomicFactExtractorOptions

  constructor(options: Partial<AtomicFactExtractorOptions> = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      maxFacts: options.maxFacts ?? DEFAULT_OPTIONS.maxFacts,
      minFactLength: options.minFactLength ?? DEFAULT_OPTIONS.minFactLength,
    }
  }

  public extract(rawContent: string, maxFacts?: number): string[] {
    return this.extractWithScores(rawContent, maxFacts).map((entry) => entry.fact)
  }

  public extractWithScores(rawContent: string, maxFacts?: number): AtomicFact[] {
    const limit = maxFacts ?? this.options.maxFacts
    if (!rawContent.trim() || limit <= 0) {
      return []
    }

    const candidates = splitIntoCandidates(rawContent)
      .map((fact) => normalizeWhitespace(fact))
      .filter((fact) => fact.length >= this.options.minFactLength)

    const deduped: AtomicFact[] = []
    for (const candidate of candidates) {
      if (deduped.length >= limit) {
        break
      }

      if (this.isNearDuplicate(candidate, deduped)) {
        continue
      }

      deduped.push({
        fact: candidate,
        confidence: scoreFactConfidence(candidate),
      })
    }

    return deduped
  }

  private isNearDuplicate(candidate: string, existing: AtomicFact[]): boolean {
    const normalizedCandidate = normalizeForSimilarity(candidate)

    return existing.some((entry) => {
      const normalizedExisting = normalizeForSimilarity(entry.fact)
      if (normalizedCandidate === normalizedExisting) {
        return true
      }
      return tokenSimilarity(normalizedCandidate, normalizedExisting) >= 0.65
    })
  }
}

function splitIntoCandidates(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeForSimilarity(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bretries\b/g, 'retry')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSimilarity(left: string, right: string): number {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'of', 'for', 'and'])
  const leftTokens = new Set(left.split(' ').filter((token) => token && !stopWords.has(token)))
  const rightTokens = new Set(right.split(' ').filter((token) => token && !stopWords.has(token)))
  const union = new Set([...leftTokens, ...rightTokens])
  if (union.size === 0) {
    return 0
  }

  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1
    }
  }
  return intersection / union.size
}

function scoreFactConfidence(fact: string): number {
  let score = 0.55
  if (/\b\d+\b/.test(fact)) {
    score += 0.15
  }
  if (/\b(is|are|will|must|supports|requires|deployed)\b/i.test(fact)) {
    score += 0.1
  }
  if (/\b(maybe|might|possibly|guess|probably)\b/i.test(fact)) {
    score -= 0.2
  }

  return clamp(score, 0.1, 0.99)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
