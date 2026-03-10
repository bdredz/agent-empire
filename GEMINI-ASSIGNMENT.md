# GEMINI-ASSIGNMENT.md

## Role

You are GEMINI. You build worker templates, dashboard components, and tool primitives.
Read AGENTS.md first — it has your operating rules and shared types.

**Rules:**
- Import types ONLY from `src/shared/types.ts`
- No `any`. No `@ts-ignore`. No `as any`.
- Commit after each worker/component. Run `npx tsc --noEmit && npx vitest run` to verify.
- Always work in your assigned branch. Never push to main directly.
- If BLOCKED, output the BLOCKED format from AGENTS.md Section 8 and move on.

---

## Build Phases (Original — All PASS)

Branch per phase. All complete as of 2026-03-04.

| # | Phase | Branch | Tests | Status |
|---|-------|--------|-------|--------|
| 8 | Worker Templates | `agent/gemini/worker-templates` | 45 | ✅ PASS |
| 10 | Dashboard Components | `agent/gemini/dashboard-components` | 0 (UI) | ✅ PASS |
| 9 | Tool Primitives (ContentScheduler, AnalyticsCollector) | `agent/gemini/tool-primitives` | 11 | ✅ PASS |

### Phase 8: Worker Templates

8 workers, each implementing `IWorker` interface. Stateless, Fast/Tiny model tier, 5+ tests each.

| Worker | File | Capabilities |
|--------|------|-------------|
| DataScraper | `src/workers/DataScraper.ts` | URL → structured JSON |
| Summarizer | `src/workers/Summarizer.ts` | Long text → condensed bullets |
| GitCommitter | `src/workers/GitCommitter.ts` | Diff + context → commit message |
| ContentFormatter | `src/workers/ContentFormatter.ts` | markdown/html/json/text conversion |
| SchemaValidator | `src/workers/SchemaValidator.ts` | JSON against Zod schema |
| ApiCaller | `src/workers/ApiCaller.ts` | Structured HTTP requests |
| NotificationSender | `src/workers/NotificationSender.ts` | Multi-channel alerts |
| DataTransformer | `src/workers/DataTransformer.ts` | ETL: filter, map, aggregate |

### Phase 10: Dashboard Components

7 React components + 1 ErrorBoundary. Tailwind styling, typed props, Zustand state.

| Component | File |
|-----------|------|
| AgentStatusCard | `src/dashboard/components/AgentStatusCard.tsx` |
| BudgetVisualization | `src/dashboard/components/BudgetVisualization.tsx` |
| BusinessMetricsPanel | `src/dashboard/components/BusinessMetricsPanel.tsx` |
| ChatInterface | `src/dashboard/components/ChatInterface.tsx` |
| EventFeed | `src/dashboard/components/EventFeed.tsx` |
| HitlApprovalQueue | `src/dashboard/components/HitlApprovalQueue.tsx` |
| TaskDAGViewer | `src/dashboard/components/TaskDAGViewer.tsx` |
| ErrorBoundary | `src/dashboard/components/ErrorBoundary.tsx` |

### Phase 9 (partial): Tool Primitives

| Primitive | Directory |
|-----------|-----------|
| ContentScheduler | `src/primitives/ContentScheduler/` |
| AnalyticsCollector | `src/primitives/AnalyticsCollector/` |

Each has: `schema.ts`, `endpoints.ts`, `operations.ts`, test file.

---

## Production Hardening Tasks

Branch: `prod-hardening`. All complete as of 2026-03-08.

| # | Task | Wave | Depends On | Status |
|---|------|------|------------|--------|
| T5 | README.md | 1 | None | ✅ PASS |
| T7 | Dashboard Build Fix (`next.config.mjs`) | 2 | T1 (CODEX) | ✅ PASS |
| T15 | Dashboard Error Boundaries | 4 | T7 | ✅ PASS |

### Files created/modified per task

**T5** — `README.md` (new). Sections: title, quick start, project structure, scripts, agent roles, tech stack, architecture, license. Under 150 lines.
**T7** — `src/dashboard/next.config.mjs` (new). Standalone output, strict TS, eslint ignored during build.
**T15** — `src/dashboard/components/ErrorBoundary.tsx` (new), `src/dashboard/app/layout.tsx` (modified to wrap children).

---

## QA Remediations (completed)

| Remediation | What Changed |
|-------------|-------------|
| Type Safety Hardening | Eliminated all `any` across 7 GEMINI-owned files. 145/145 tests passing. |
| CODEX Primitives DRY | Extracted shared `QueryChain<T>` and `PrimitiveDb` into `src/primitives/db.ts`. |

---

## Phase 2 — Control Plane Hardening + Memory Spine

Branch: `agent/gemini/phase-2-minions`
Ref: AGENTS.md Sections 8-9, Appendices A-F

GEMINI owns deterministic minions (Phase 15), dashboard updates for telemetry/audit, and dynamic tool loading (Phase 17). CODEX builds the bulk infrastructure. OPUS handles the Jarvis refactor and integration.

### Phase 2 Task Table

| # | Task | Wave | Phase | Depends On | Status |
|---|------|------|-------|------------|--------|
| P2-G1 | Create `src/minions/TelemetryMinion.ts` + tests | 4 | 15 | P2-C5 (Dispatcher wired) | ✅ PASS |
| P2-G2 | Create `src/minions/AuditMinion.ts` + tests | 4 | 15 | P2-C1 (contracts) | ✅ PASS |
| P2-G3 | Create `src/minions/TokenBurnAnalyzer.ts` + tests | 4 | 15 | P2-G1 | ✅ PASS |
| P2-G4 | Create `src/minions/SecretLeakScanner.ts` + tests | 4 | 15 | P2-G2 | ✅ PASS |
| P2-G5 | Create `src/minions/SchemaConformanceChecker.ts` + tests | 4 | 15 | P2-G2 | ✅ PASS |
| P2-G6 | Update `EventFeed.tsx` — render telemetry/audit events | 4 | 15 | P2-G1, P2-G2 | ✅ PASS |
| P2-G7 | Update `BudgetVisualization.tsx` — anomaly markers | 4 | 15 | P2-G3 | ✅ PASS |
| P2-G8 | Create `src/tools/ToolDiscoveryService.ts` + tests | 7 | 17 | P2-C5 | ✅ PASS |
| P2-G9 | Create `src/tools/DomainToolRegistry.ts` + tests | 7 | 17 | P2-G8 | ✅ PASS |
| P2-G10 | Create `src/primitives/ApiGateway/manifest.ts` | 8 | 18 | P2-C24 (CapManifestWriter) | ✅ PASS |

### Wave 4 — Telemetry & Audit Minions (P2-G1 through P2-G7)

Minions are low-cost, deterministic control helpers. They use NO LLM calls. Pure code. They intercept waste and risk before expensive paths fire.

**P2-G1: Create `src/minions/TelemetryMinion.ts` + tests**
Tracks token burn rates and detects anomalies across agents:
- Subscribes to budget usage events from `IBudgetGovernor`
- Maintains per-agent token burn rate (tokens/minute)
- Detects abnormal spend patterns (spike detection, sustained high burn)
- Emits structured `SystemEvent` telemetry alerts
- Feeds data to `BudgetVisualization` via event store

Interface:
```typescript
interface ITelemetryMinion {
  recordUsage(agentId: AgentId, usage: Partial<BudgetUsage>): void
  detectAnomalies(agentId: AgentId): TelemetryAlert[]
  getAgentBurnRate(agentId: AgentId): { tokensPerMinute: number; trend: 'rising' | 'stable' | 'falling' }
}
```
Inject: `IBudgetGovernor` (read-only), event emitter.
Min 8 tests: record usage, detect spike, detect sustained burn, normal usage no alert, burn rate calculation, trend detection, multiple agents, reset on circuit breaker.
Verify: `npx vitest run src/minions/TelemetryMinion.test.ts`

**P2-G2: Create `src/minions/AuditMinion.ts` + tests**
Pre-screens worker/agent outputs for safety issues before eval pipeline:
- Checks for malformed output (missing required fields)
- Checks for unsafe content patterns (code injection, prompt injection markers)
- Checks for secrets/credentials in output
- Returns structured audit verdict: `pass | warn | reject`
- Rejected outputs bypass expensive LLM critic — fail fast

Interface:
```typescript
interface IAuditMinion {
  audit(output: Record<string, unknown>, context: { agentId: AgentId; taskType: string }): AuditVerdict
}

interface AuditVerdict {
  outcome: 'pass' | 'warn' | 'reject'
  issues: Array<{ code: string; message: string; severity: 'info' | 'warning' | 'critical' }>
}
```
Min 8 tests: clean output passes, malformed output rejects, secret detection, injection pattern detection, empty output handling, warn-level issue, multiple issues aggregation, context-aware rules.
Verify: `npx vitest run src/minions/AuditMinion.test.ts`

**P2-G3: Create `src/minions/TokenBurnAnalyzer.ts` + tests**
Statistical analysis component used by `TelemetryMinion`:
- Rolling window token consumption (configurable window size)
- Percentile-based anomaly detection (p95, p99)
- Cost projection based on current burn rate
- Budget exhaustion ETA calculation
Min 6 tests: rolling window accumulation, percentile calculation, cost projection, ETA calculation, empty window, window rollover.
Verify: `npx vitest run src/minions/TokenBurnAnalyzer.test.ts`

**P2-G4: Create `src/minions/SecretLeakScanner.ts` + tests**
Pattern-based detection for secrets/credentials in text output:
- Regex patterns for API keys, tokens, passwords, connection strings
- Entropy-based detection for high-entropy strings
- Returns structured findings with location and confidence
- Used by `AuditMinion` as a sub-check
Min 6 tests: detect API key pattern, detect high-entropy string, clean text passes, mixed content with secrets, multiple secrets, false positive resistance.
Verify: `npx vitest run src/minions/SecretLeakScanner.test.ts`

**P2-G5: Create `src/minions/SchemaConformanceChecker.ts` + tests**
Validates worker output against expected schemas:
- Accepts Zod schema and output data
- Returns structured conformance result
- Lists specific field violations
- Used by `AuditMinion` to reject malformed outputs before eval
Min 6 tests: conforming output, missing required field, wrong type, extra fields (should pass if schema allows), nested object validation, array validation.
Verify: `npx vitest run src/minions/SchemaConformanceChecker.test.ts`

**P2-G6: Update `src/dashboard/components/EventFeed.tsx`**
Add rendering support for telemetry and audit event types:
- `TelemetryAlert` events: show agent ID, burn rate, anomaly type, severity badge
- `AuditVerdict` events: show outcome badge (pass/warn/reject), issue list
- New event type filter chips in the feed header
- Preserve existing SystemEvent rendering

**P2-G7: Update `src/dashboard/components/BudgetVisualization.tsx`**
Add anomaly markers from `TelemetryMinion`:
- Overlay anomaly points on budget charts (spike indicators)
- Add burn rate trend line per agent
- Add budget exhaustion ETA display
- Preserve existing budget visualization behavior

### Wave 7 — Dynamic Tool Loading (P2-G8 through P2-G9)

Goal: reduce prompt and schema bloat by exposing only relevant tool surfaces to workers/minions.

**P2-G8: Create `src/tools/ToolDiscoveryService.ts` + tests**
Metadata-driven tool discovery:
- Index available tools with domain tags (e.g., `lead_management`, `content`, `analytics`)
- Accept a task type or domain and return relevant tool definitions
- Return tool schemas in a format ready for prompt injection
- Deterministic — no LLM calls, no recursive discovery

Interface:
```typescript
interface IToolDiscoveryService {
  register(tool: ToolDefinition): void
  discover(domain: string): ToolDefinition[]
  discoverForTask(taskType: string): ToolDefinition[]
}

interface ToolDefinition {
  name: string
  domain: string
  description: string
  schema: Record<string, unknown>
  mcpEndpoint?: string
}
```
Min 6 tests: register and discover, domain filtering, task-type mapping, no matches, multiple domains, duplicate registration handling.
Verify: `npx vitest run src/tools/ToolDiscoveryService.test.ts`

**P2-G9: Create `src/tools/DomainToolRegistry.ts` + tests**
Pre-configured registry mapping domains to tool bundles:
- Static mapping of task domains → tool sets
- Used by `WorkerTaskExecutor` to narrow tool surfaces per worker
- Configurable via config, not hardcoded
- Returns lean tool descriptions (name + schema only, no full docs)
Min 6 tests: domain lookup, unknown domain returns empty, override config, multiple tools per domain, tool dedup, lean output format.
Verify: `npx vitest run src/tools/DomainToolRegistry.test.ts`

**P2-G10: Create `src/primitives/ApiGateway/manifest.ts`**
Structured capability manifest definition for the ApiGateway primitive:
- Exports a factory function producing `CapabilityManifest` for deployed ApiGateway instances
- Includes: service name, version, base URL template, supported operations, auth scheme
- Used by `CapabilityManifestWriter` (CODEX) after deployment
Verify: `npx tsc --noEmit`

### Key constraints for Phase 2

- **Minions are deterministic.** Zero LLM calls. Pure code, pure logic.
- **Minions fail closed.** If a check cannot complete, it rejects — it does not skip.
- **Telemetry must be structured and queryable**, not log soup.
- **Tool discovery is NOT recursive or expensive.** Static metadata lookups only.
- **Dashboard updates preserve existing behavior.** Add, don't break.

### Quality Checklists

**Per Minion:** Deterministic (no LLM), structured output, 6+ tests, injects dependencies, emits SystemEvent, passes typecheck.

**Per Tool Module:** Typed ToolDefinition, domain-tagged, deterministic discovery, 6+ tests, passes typecheck.

**Per Component Update:** Preserves existing props/behavior, handles new event types gracefully, Tailwind only, passes build.

---

## Phase 3 — Trusted External Operations: Evidence, Discovery, Hive Mind V2, Dashboard

Branch: `agent/gemini/phase-3-evidence-discovery`
Ref: `phase-3-master-blueprint-agent-empire.md` Sections 8.2, 8.4, 12, 15

**IMPORTANT — Branch Discipline:**
- Work ONLY in branch `agent/gemini/phase-3-evidence-discovery`
- Push to `main` ONLY when a task is complete and verified (`npx tsc --noEmit && npx vitest run` both PASS)
- Never push partial or failing work to `main`
- If you need interfaces from CODEX or OPUS that are not yet on `main`, mock them in tests and mark the task as BLOCKED on that dependency

GEMINI owns the Evidence Plane, Discovery Plane, Hive Mind V2 namespace upgrades, and all Phase 3 dashboard components. CODEX builds the Trust Plane, Commerce Plane, and Gateway. OPUS handles DI wiring, integration tests, and chaos protocol.

### Phase 3 Task Table

| # | Task | Wave | Seq | Depends On | Status |
|---|------|------|-----|------------|--------|
| P3-G1 | Create `src/evidence/IResearchBroker.ts` | 3 | 3 | P3-C1 (contracts) | ⬜ NOT_STARTED |
| P3-G2 | Create `src/evidence/SourcePolicyEngine.ts` + tests | 3 | 3 | P3-C1 | ⬜ NOT_STARTED |
| P3-G3 | Create `src/evidence/EvidenceStore.ts` + tests | 3 | 3 | P3-C1 | ⬜ NOT_STARTED |
| P3-G4 | Create `src/evidence/ClaimExtractor.ts` + tests | 3 | 3 | P3-C1 | ⬜ NOT_STARTED |
| P3-G5 | Create `src/evidence/FreshnessScorer.ts` + tests | 3 | 3 | P3-C1 | ⬜ NOT_STARTED |
| P3-G6 | Create `src/evidence/CitationCompiler.ts` + tests | 3 | 3 | P3-C1 | ⬜ NOT_STARTED |
| P3-G7 | Create `src/evidence/ResearchBroker.ts` + tests | 3 | 3 | P3-G1 thru P3-G6 | ⬜ NOT_STARTED |
| P3-G8 | Create `src/evidence/ResearchReportBuilder.ts` + tests | 3 | 3 | P3-G4, P3-G5, P3-G6 | ⬜ NOT_STARTED |
| P3-G9 | Create `src/discovery/InternalServiceRegistry.ts` + tests | 7 | 7 | P3-C1 | ⬜ NOT_STARTED |
| P3-G10 | Create `src/discovery/ExternalManifestPublisher.ts` + tests | 7 | 7 | P3-G9 | ⬜ NOT_STARTED |
| P3-G11 | Create `src/discovery/DiscoveryPolicyEngine.ts` + tests | 7 | 7 | P3-G9 | ⬜ NOT_STARTED |
| P3-G12 | Create `src/discovery/ProtocolInjectionSwarm.ts` + tests | 7 | 7 | P3-G10, P3-G11 | ⬜ NOT_STARTED |
| P3-G13 | Upgrade Librarian — Hive Mind V2 namespaces | 7b | 15 | P3-C1, P3-G3 | ⬜ NOT_STARTED |
| P3-G14 | Dashboard — TrustDashboard component | 7b | — | P3-C1 | ⬜ NOT_STARTED |
| P3-G15 | Dashboard — CommerceActivityPanel component | 7b | — | P3-C1 | ⬜ NOT_STARTED |
| P3-G16 | Dashboard — EvidenceViewer component | 7b | — | P3-G3 | ⬜ NOT_STARTED |
| P3-G17 | Dashboard — DiscoveryPanel component | 7b | — | P3-G9 | ⬜ NOT_STARTED |

---

### Wave 3 — Evidence Plane (P3-G1 through P3-G8)

All files go in `src/evidence/`. This plane ensures research outputs are always evidence-backed, cited, and freshness-scored. **Research never writes directly into durable memory.**

**P3-G1: Create `src/evidence/IResearchBroker.ts`**
Interface for the deterministic research coordinator:
```typescript
interface IResearchBroker {
  research(params: {
    question: string;
    tenantId: string;
    freshnessRequirement?: 'realtime' | 'recent' | 'any';
    maxSources?: number;
    budgetTokens?: number;
  }): Promise<ResearchReport>
  getEvidence(evidenceId: string): Promise<EvidenceRecord | null>
  listEvidence(questionId: string): Promise<EvidenceRecord[]>
}
```
The ResearchBroker is a **deterministic coordinator**, NOT an LLM agent. It orchestrates: fetch → extract → compare → summarize. No free-form LLM browsing.
Verify: `npx tsc --noEmit`

**P3-G2: Create `src/evidence/SourcePolicyEngine.ts` + tests**
Controls which sources are allowed for research:
- Allow/deny lists by domain (e.g., allow `*.gov`, deny `example-spam.com`)
- Allow/deny by category (`news`, `academic`, `social_media`, `registry`)
- Source trust tiers: `tier_1` (authoritative), `tier_2` (reputable), `tier_3` (unverified)
- Recency requirements per question type
- Escalation for high-risk domains (financial data, medical, legal)
- Returns `{ allowed: boolean; tier: string; reason?: string; escalate?: boolean }`

Min 8 tests: allowed domain, denied domain, category filter, tier assignment, recency requirement, high-risk escalation, wildcard domain matching, empty policy allows all tier_3.
Verify: `npx vitest run src/evidence/SourcePolicyEngine.test.ts`

**P3-G3: Create `src/evidence/EvidenceStore.ts` + tests**
Stores raw research evidence with provenance:
- Accepts `EvidenceRecord` — raw fetch snapshots or content hashes
- Generates unique `evidenceId`
- Computes `contentHash` (SHA-256 of raw content)
- Stores: source URL, fetch timestamp, published timestamp, trust score, freshness score
- Query by `questionId`, `tenantId`, `sourceUrl`
- Dedup by `contentHash` (same content from same source = skip)
- In-memory Map store for now

Min 8 tests: store evidence, retrieve by ID, query by question, dedup by content hash, tenant isolation, freshness score assignment, trust score from source tier, list by source URL.
Verify: `npx vitest run src/evidence/EvidenceStore.test.ts`

**P3-G4: Create `src/evidence/ClaimExtractor.ts` + tests**
Turns fetched evidence into atomic claims:
- Input: raw text content + `evidenceId`
- Output: `AtomicClaim[]`
- Splits content into individual factual assertions
- Each claim: unique `claimId`, reference to `evidenceId`, statement text, confidence score (0-1)
- Deterministic extraction — sentence splitting + assertion filtering (no LLM)
- Filters out: questions, opinions without evidence, meta-statements

Min 8 tests: single claim, multi-claim, confidence scoring, question filtering, opinion filtering, empty content, long content truncation, evidence ID linkage.
Verify: `npx vitest run src/evidence/ClaimExtractor.test.ts`

**P3-G5: Create `src/evidence/FreshnessScorer.ts` + tests**
Tags evidence and claims with recency/freshness confidence:
- Score (0-1) based on: `fetchedAt` vs now, `publishedAt` vs now, source tier decay rate
- Tier 1 sources decay slower; Tier 3 decay fastest
- Configurable half-life per tier (default: tier_1 = 30d, tier_2 = 7d, tier_3 = 1d)
- Returns `{ freshnessScore: number; staleAt: string; confidence: number }`

Min 6 tests: fresh content scores high, stale content scores low, tier affects decay, custom half-life, published date preferred over fetch date, missing published date fallback.
Verify: `npx vitest run src/evidence/FreshnessScorer.test.ts`

**P3-G6: Create `src/evidence/CitationCompiler.ts` + tests**
Creates human- and machine-readable citation bundles:
- Input: `AtomicClaim[]` + `EvidenceRecord[]`
- Output: `{ citations: Citation[]; bibliography: BibliographyEntry[] }`
- Deduplicates bibliography entries by source URL
- Produces Markdown-formatted citation text

Min 6 tests: single citation, multiple from same source (dedup bibliography), missing published date, bibliography format, markdown output, empty claims.
Verify: `npx vitest run src/evidence/CitationCompiler.test.ts`

**P3-G7: Create `src/evidence/ResearchBroker.ts` + tests**
Implements `IResearchBroker`. Deterministic research coordinator (blueprint Section 12.2):

Research lifecycle:
1. Receive research objective with `tenantId` and freshness requirements
2. Apply `SourcePolicyEngine` to determine allowed sources and tiers
3. Define freshness targets from `FreshnessScorer`
4. Simulate evidence fetch (stub — real fetchers later)
5. Store raw evidence in `EvidenceStore` with content hashes
6. Extract atomic claims via `ClaimExtractor`
7. Score freshness via `FreshnessScorer`
8. Compile citations via `CitationCompiler`
9. Build `ResearchReport` via `ResearchReportBuilder`
10. Emit `MemoryProposal` for candidate durable learnings (proposal-only, NOT direct write)

**Hard guardrail:** Research NEVER writes directly into durable memory.

Inject: `SourcePolicyEngine`, `EvidenceStore`, `ClaimExtractor`, `FreshnessScorer`, `CitationCompiler`, `ResearchReportBuilder`.
Min 10 tests: full lifecycle, source policy enforcement, evidence stored with hash, claims extracted, freshness scored, citations compiled, report built, memory proposals emitted (not direct writes), budget enforcement, tenant scoping.
Verify: `npx vitest run src/evidence/ResearchBroker.test.ts`

**P3-G8: Create `src/evidence/ResearchReportBuilder.ts` + tests**
Structured report generation from claims and evidence:
- Input: question, `AtomicClaim[]`, `EvidenceRecord[]`, citations, freshness data
- Output: `ResearchReport` with ALL required fields:
  - `question`, `answer` (synthesized from claims), `claims`, `evidenceIds`
  - `freshnessDate` (oldest evidence date), `confidence` (aggregate), `gaps`, `recommendedNextAction`
- Answer synthesis is deterministic claim aggregation, NOT LLM summarization

Min 8 tests: full report, confidence aggregation, gap detection, freshness date = oldest, recommended action on gaps, empty claims = low confidence, structure validation, tenant preserved.
Verify: `npx vitest run src/evidence/ResearchReportBuilder.test.ts`

---

### Wave 7 — Discovery Plane (P3-G9 through P3-G12)

All files go in `src/discovery/`.

**P3-G9: Create `src/discovery/InternalServiceRegistry.ts` + tests**
Index of internal service manifests:
- Register `ExternalCapabilityManifest` entries
- Query by: service name, operation, tenant, auth scheme, payment rail
- Map: service → owner → auth scheme → version → reliability score
- Version filtering (latest, specific version)
- Tenant-scoped visibility
- Extends Phase 2 `InternalRegistry` concept with richer `ExternalCapabilityManifest` queries

Min 8 tests: register, query by name, query by operation, query by auth scheme, tenant isolation, version filtering, reliability sorting, duplicate update.
Verify: `npx vitest run src/discovery/InternalServiceRegistry.test.ts`

**P3-G10: Create `src/discovery/ExternalManifestPublisher.ts` + tests**
Publishes machine-readable service metadata:
- Generates `.well-known/agent-services.json` manifest structure
- Produces structured service descriptors
- Filters by `DiscoveryPolicyEngine` approval
- Returns JSON, does NOT write files

Min 6 tests: generate manifest, filter private services, include trust metadata, empty registry, version in output, auth scheme reflected.
Verify: `npx vitest run src/discovery/ExternalManifestPublisher.test.ts`

**P3-G11: Create `src/discovery/DiscoveryPolicyEngine.ts` + tests**
Decides what gets published externally:
- `internal_only` auth scheme → never publish
- Requires minimum reliability score
- Requires trust badge
- Ensures private services never leak
- Returns `{ publishable: boolean; reason?: string }`

Min 6 tests: publishable passes, internal_only blocked, low reliability blocked, missing badge blocked, custom threshold, all filtered = empty.
Verify: `npx vitest run src/discovery/DiscoveryPolicyEngine.test.ts`

**P3-G12: Create `src/discovery/ProtocolInjectionSwarm.ts` + tests**
Distributes agent-first services into external registries (stubbed in Phase 3):
- Generates registration payloads for external registries
- Tracks submission status: `pending`, `submitted`, `confirmed`, `drifted`
- Detects listing drift
- Returns structured submission report
- Does NOT actually submit to external registries in Phase 3

Min 6 tests: generate payload, track status, detect drift, multiple registries, idempotent submission, report structure.
Verify: `npx vitest run src/discovery/ProtocolInjectionSwarm.test.ts`

---

### Wave 7b — Hive Mind V2 + Dashboard (P3-G13 through P3-G17)

**P3-G13: Upgrade Librarian — Hive Mind V2 Namespaces**
Modify `src/librarian/Librarian.ts` and related types for Phase 3 namespaces (blueprint Section 15):

New namespaces for `MemoryKind`:
- `research_facts` — evidence-backed research claims (require `freshnessScore` + provenance)
- `identity_records` — agent identity snapshots
- `commerce_records` — transaction receipts and ledger entries
- `counterparty_records` — known external entity records
- `incident_records` — trust violations and revocations

Changes:
- Extend `MemoryKind` union (coordinate with P3-C1)
- Add namespace-aware query filtering in `RetrievalPolicyEnforcer`
- Add freshness metadata to `KnowledgeEntryV2` for research namespace
- Preserve ALL existing V1/V2 behavior

Min 6 tests: store research fact with freshness, query by namespace, research facts include provenance, commerce records queryable, tenant isolation across namespaces, existing behavior preserved.
Verify: `npx vitest run src/librarian/`

**P3-G14: Dashboard — TrustDashboard Component**
Create `src/dashboard/components/TrustDashboard.tsx`:
- Agent identities with verification status badges (gray/green/yellow/red)
- Active mandates table (agent, purpose, scope, expiry, status)
- Counterparty list with trust status indicators
- Recent trust audit log entries (last 20)
- Revocation alert banner
- Tailwind CSS, typed props, no `any`

**P3-G15: Dashboard — CommerceActivityPanel Component**
Create `src/dashboard/components/CommerceActivityPanel.tsx`:
- Recent transactions feed with status badges
- Active quotes with expiry countdown
- Treasury balance summary (available / held per wallet)
- Refund/credit activity log
- Settlement reconciliation status indicator
- Rails breakdown pie chart (recharts)
- Tailwind + recharts, typed props, no `any`

**P3-G16: Dashboard — EvidenceViewer Component**
Create `src/dashboard/components/EvidenceViewer.tsx`:
- Research report viewer (question, answer, confidence, freshness)
- Claims list with evidence source links
- Citation bibliography
- Freshness indicator (green/yellow/red)
- Evidence source list with trust tier badges
- Gaps section
- Tailwind CSS, typed props, no `any`

**P3-G17: Dashboard — DiscoveryPanel Component**
Create `src/dashboard/components/DiscoveryPanel.tsx`:
- Registered services table (name, version, auth, reliability)
- Published manifests with publication status
- Protocol injection swarm status
- Service health indicators
- Filter by tenant, auth scheme, payment rail
- Tailwind CSS, typed props, no `any`

---

### Key Constraints for Phase 3

- **Research is deterministic.** No LLM calls in the broker. Orchestrate, don't generate.
- **Evidence before memory.** Research emits `MemoryProposal`, never writes durable memory directly.
- **Every research output must cite evidence.** No claim without a source.
- **Freshness is first-class.** Every evidence record has a freshness score.
- **Discovery does not mean publish everything.** `DiscoveryPolicyEngine` gates external exposure.
- **Dashboard preserves existing behavior.** New components add, never break.
- **Same minion discipline.** Deterministic, structured-output, dependency-injected.
- **Existing tests must keep passing.**

---

## What You Do NOT Build (Phase 3)

- Trust Plane — AgentIdentityService, MandateService, VerificationPolicyEngine, etc. (CODEX)
- Commerce Plane — CommerceOrchestrator, QuoteService, ReceiptService, etc. (CODEX)
- Provider Adapters — Stripe, x402, Coinbase, MCP-PAY, AP2 (CODEX)
- Wallet & Treasury — WalletPolicyEngine, TreasuryService, etc. (CODEX)
- Gateway Hardening — AgentGradeApiGateway, PaymentChallengeMiddleware, etc. (CODEX)
- DI container wiring (OPUS)
- Phase 3 integration tests (OPUS)
- Controlled chaos protocol tests (OPUS)

Do not touch files owned by other agents. Mock missing interfaces in tests.

---

## Phase 3 Launch Prompt

```
Read AGENTS.md Sections 1-9. Then read GEMINI-ASSIGNMENT.md (Phase 3 section).
Read phase-3-master-blueprint-agent-empire.md Sections 8.2, 8.4, 12, 15 for full context.

BRANCH DISCIPLINE:
- Create and work in branch: agent/gemini/phase-3-evidence-discovery
- Push to main ONLY when a task is complete and verified
- Never push partial or failing work to main

Execute Phase 3 tasks in wave order (3 → 7 → 7b).
Wave 3 (Evidence Plane) depends on P3-C1 (contracts by CODEX). If not on main yet, define types locally and note the dependency.
Wave 7 (Discovery Plane) depends on P3-C1.
Wave 7b (Hive Mind V2 + Dashboard) — dashboard components can start once contracts are frozen.

Run `npx tsc --noEmit && npx vitest run` after each task.
Commit: `[GEMINI:component] Phase 3 Seq N: description`
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
Continue until all tasks show PASS or are BLOCKED.
```
