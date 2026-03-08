import { describe, expect, it } from 'vitest'
import { AtomicFactExtractor } from './AtomicFactExtractor'

describe('AtomicFactExtractor', () => {
  it('returns empty for empty input', () => {
    const extractor = new AtomicFactExtractor()
    expect(extractor.extract('   ')).toEqual([])
  })

  it('extracts a single fact', () => {
    const extractor = new AtomicFactExtractor()
    const facts = extractor.extract('The dispatcher owns retries.')

    expect(facts).toEqual(['The dispatcher owns retries.'])
  })

  it('extracts multiple facts from paragraph input', () => {
    const extractor = new AtomicFactExtractor()
    const facts = extractor.extract(
      'Workers emit memory proposals. Librarian validates proposals. Retrieval is tenant-scoped.',
    )

    expect(facts).toHaveLength(3)
  })

  it('deduplicates near-identical facts', () => {
    const extractor = new AtomicFactExtractor()
    const facts = extractor.extract(
      'Dispatcher manages retries. The dispatcher manages retry logic. Dispatcher manages retries!',
    )

    expect(facts).toHaveLength(1)
  })

  it('scores concrete facts higher than uncertain facts', () => {
    const extractor = new AtomicFactExtractor()
    const scored = extractor.extractWithScores(
      'System supports 3 retries per node. System might maybe support retries.',
    )

    expect(scored[0]?.confidence).toBeGreaterThan(scored[1]?.confidence ?? 0)
  })

  it('respects max-facts limit', () => {
    const extractor = new AtomicFactExtractor({ maxFacts: 2 })
    const facts = extractor.extract(
      'One fact here. Two fact here. Three fact here. Four fact here.',
    )

    expect(facts).toHaveLength(2)
  })
})
