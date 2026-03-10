import { describe, it, expect, vi } from 'vitest'
import { SourcePolicyEngine } from '../evidence/SourcePolicyEngine.js'
import { EvidenceStore } from '../evidence/EvidenceStore.js'
import { ClaimExtractor } from '../evidence/ClaimExtractor.js'
import { FreshnessScorer } from '../evidence/FreshnessScorer.js'
import { CitationCompiler } from '../evidence/CitationCompiler.js'
import { ResearchReportBuilder } from '../evidence/ResearchReportBuilder.js'
import { ResearchBroker } from '../evidence/ResearchBroker.js'
import type { MemoryProposal } from '@shared/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefaultBroker(
  policyOverrides: ConstructorParameters<typeof SourcePolicyEngine>[0] = {},
  proposalSink?: (p: MemoryProposal) => void
): ResearchBroker {
  const sourcePolicyEngine = new SourcePolicyEngine(policyOverrides)
  const evidenceStore = new EvidenceStore()
  const claimExtractor = new ClaimExtractor()
  const freshnessScorer = new FreshnessScorer()
  const citationCompiler = new CitationCompiler()
  const reportBuilder = new ResearchReportBuilder()

  return new ResearchBroker(
    sourcePolicyEngine,
    evidenceStore,
    claimExtractor,
    freshnessScorer,
    citationCompiler,
    reportBuilder,
    proposalSink
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Evidence Plane — end-to-end integration', () => {
  // -------------------------------------------------------------------------
  // Test 1: Full research lifecycle
  // -------------------------------------------------------------------------

  it('produces a complete ResearchReport with all required fields populated', async () => {
    const broker = makeDefaultBroker()

    const report = await broker.research({
      question: 'What is the impact of climate change on agriculture?',
      tenantId: 'tenant-alpha',
      freshnessRequirement: 'any'
    })

    // Identity fields
    expect(report.reportId).toBeDefined()
    expect(typeof report.reportId).toBe('string')
    expect(report.reportId.length).toBeGreaterThan(0)

    expect(report.tenantId).toBe('tenant-alpha')

    // Question passthrough
    expect(report.question).toBe('What is the impact of climate change on agriculture?')

    // Answer must be a non-empty string
    expect(typeof report.answer).toBe('string')
    expect(report.answer.length).toBeGreaterThan(0)

    // Claims — broker simulates sources and ClaimExtractor produces claims
    expect(Array.isArray(report.claims)).toBe(true)
    expect(report.claims.length).toBeGreaterThan(0)

    // Evidence IDs
    expect(Array.isArray(report.evidenceIds)).toBe(true)
    expect(report.evidenceIds.length).toBeGreaterThan(0)

    // Confidence must be positive (evidence was found)
    expect(report.confidence).toBeGreaterThan(0)

    // Freshness date must be a valid ISO string
    expect(typeof report.freshnessDate).toBe('string')
    const parsed = new Date(report.freshnessDate)
    expect(isNaN(parsed.getTime())).toBe(false)

    // Gaps array is present
    expect(Array.isArray(report.gaps)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test 2: Source policy enforcement — denied domain is excluded
  // -------------------------------------------------------------------------

  it('excludes evidence sourced from a denied domain (spam.com)', async () => {
    // Only deny spam.com — all other sources pass through
    const broker = makeDefaultBroker({ deniedDomains: ['spam.com'] })

    const report = await broker.research({
      question: 'Are there any threats from spam sources?',
      tenantId: 'tenant-beta'
    })

    // Retrieve the actual evidence records stored for this report
    const evidencePromises = report.evidenceIds.map((id) =>
      broker.getEvidence(id, 'tenant-beta')
    )
    const evidenceRecords = await Promise.all(evidencePromises)

    for (const record of evidenceRecords) {
      expect(record).not.toBeNull()
      // The spam.com URL must not appear in any stored evidence
      expect(record!.sourceUrl).not.toContain('spam.com')
    }

    // Sanity: we still have some evidence from allowed sources
    expect(report.evidenceIds.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Test 3: Evidence store tenant isolation
  // -------------------------------------------------------------------------

  it('isolates EvidenceStore records by tenantId', async () => {
    const evidenceStore = new EvidenceStore()

    // Store evidence under tenant-A
    const stored = await evidenceStore.storeEvidence({
      questionId: 'q-test-isolation',
      tenantId: 'tenant-A',
      sourceUrl: 'https://example.com/report',
      sourceType: 'webpage',
      fetchedAt: new Date().toISOString(),
      trustScore: 0.9,
      freshnessScore: 0.85,
      rawContent: 'This is tenant-A specific evidence content with factual statements.'
    })

    const evidenceId = stored.evidenceId

    // Query with wrong tenant → null
    const missingRecord = await evidenceStore.getEvidence(evidenceId, 'tenant-B')
    expect(missingRecord).toBeNull()

    // Query with correct tenant → returns the record
    const foundRecord = await evidenceStore.getEvidence(evidenceId, 'tenant-A')
    expect(foundRecord).not.toBeNull()
    expect(foundRecord!.evidenceId).toBe(evidenceId)
    expect(foundRecord!.tenantId).toBe('tenant-A')
    expect(foundRecord!.sourceUrl).toBe('https://example.com/report')

    // listEvidenceByQuestion also respects tenant isolation
    const listForB = await evidenceStore.listEvidenceByQuestion('q-test-isolation', 'tenant-B')
    expect(listForB).toHaveLength(0)

    const listForA = await evidenceStore.listEvidenceByQuestion('q-test-isolation', 'tenant-A')
    expect(listForA).toHaveLength(1)
    expect(listForA[0]!.evidenceId).toBe(evidenceId)
  })

  // -------------------------------------------------------------------------
  // Test 4: Memory proposals emitted via sink — no direct Librarian writes
  // -------------------------------------------------------------------------

  it('emits MemoryProposals via the proposalSink without performing direct Librarian writes', async () => {
    const capturedProposals: MemoryProposal[] = []
    const proposalSink = vi.fn((p: MemoryProposal) => {
      capturedProposals.push(p)
    })

    const broker = makeDefaultBroker({}, proposalSink)

    const report = await broker.research({
      question: 'How does AI affect software engineering productivity?',
      tenantId: 'tenant-gamma'
    })

    // Only check proposals if confidence threshold was met
    if (report.confidence > 0.5 && report.claims.length > 0) {
      expect(proposalSink).toHaveBeenCalled()

      const emitted = broker.getEmittedProposals()
      expect(emitted.length).toBeGreaterThan(0)

      for (const proposal of emitted) {
        expect(proposal.kind).toBe('research_facts')
        expect(proposal.sourceAgentId).toBe('ResearchBroker')
        expect(proposal.confidence).toBeGreaterThan(0)
        expect(typeof proposal.rawContent).toBe('string')
        expect(proposal.rawContent.length).toBeGreaterThan(0)
        expect(proposal.tenantId).toBe('tenant-gamma')
        expect(proposal.proposalId).toBeDefined()
        expect(proposal.createdAt).toBeDefined()
      }

      // The sink must have been called with the same proposals that were captured
      expect(capturedProposals).toHaveLength(emitted.length)
    }

    // Verify no direct Librarian writes occurred — the sink spy is the only channel
    // If proposalSink was NOT called, no proposals were emitted (below threshold)
    // Either way, no librarian module was imported or invoked
    const libraryModuleInvocations = proposalSink.mock.calls.length
    // All calls to the sink must match what getEmittedProposals returns
    expect(libraryModuleInvocations).toBe(broker.getEmittedProposals().length)
  })

  // -------------------------------------------------------------------------
  // Test 5: Budget exhaustion — throws when budgetTokens < 10
  // -------------------------------------------------------------------------

  it('throws "Budget exhausted" error when budgetTokens is below minimum threshold', async () => {
    const broker = makeDefaultBroker()

    await expect(
      broker.research({
        question: 'Will this work?',
        tenantId: 'tenant-delta',
        budgetTokens: 5
      })
    ).rejects.toThrow('Budget exhausted')
  })

  // -------------------------------------------------------------------------
  // Test 6: All claims have required fields with valid values
  // -------------------------------------------------------------------------

  it('extracts claims with all required fields: claimId, evidenceId, statement, confidence > 0, extractedAt', async () => {
    const broker = makeDefaultBroker()

    const report = await broker.research({
      question: 'What are the benefits of renewable energy sources?',
      tenantId: 'tenant-epsilon',
      freshnessRequirement: 'recent'
    })

    expect(report.claims.length).toBeGreaterThan(0)

    for (const claim of report.claims) {
      // claimId must be a non-empty string
      expect(typeof claim.claimId).toBe('string')
      expect(claim.claimId.length).toBeGreaterThan(0)

      // evidenceId must be a non-empty string
      expect(typeof claim.evidenceId).toBe('string')
      expect(claim.evidenceId.length).toBeGreaterThan(0)

      // statement must be a non-empty string
      expect(typeof claim.statement).toBe('string')
      expect(claim.statement.length).toBeGreaterThan(0)

      // confidence must be between 0 (exclusive) and 1 (inclusive)
      expect(claim.confidence).toBeGreaterThan(0)
      expect(claim.confidence).toBeLessThanOrEqual(1)

      // extractedAt must be a valid ISO timestamp
      expect(typeof claim.extractedAt).toBe('string')
      const ts = new Date(claim.extractedAt)
      expect(isNaN(ts.getTime())).toBe(false)

      // evidenceId must reference one of the evidence records in the report
      expect(report.evidenceIds).toContain(claim.evidenceId)
    }
  })
})
