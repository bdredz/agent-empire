# Agent Empire: Project Memory

## PHASE 3 COMPLETE — 2026-03-11
- **All 59 tasks PASS** across 3 agents (CODEX 30, GEMINI 17, OPUS 12)
- **All 9 waves PASS** (Contract Freeze, Trust, Evidence, Commerce, Adapters, Wallet/Treasury, Discovery, Hive Mind V2 + Dashboard, Gateway, Integration & Chaos)
- **731/731 tests**, 90 files, typecheck clean
- **Next milestone**: Phase 4 or user-directed work

---

## 2026-03-11 — OPUS Phase 3: P3-O11/O12 (Cross-Plane + Chaos Protocol — Wave 9 COMPLETE)

### What changed
- **P3-O11**: Created `src/integration/crossPlane.test.ts` — 6 cross-plane integration tests:
  - Trust→Commerce mandate gate (revoked mandate blocks authorize)
  - Trust→Commerce agent revocation blocks commerce
  - Commerce→Trust counterparty blocking halts new quotes
  - Trust→Commerce wallet freeze blocks WalletPolicyEngine evaluation
  - Evidence→Commerce confidence below threshold blocks proposal sink
  - Full end-to-end: identity→mandate→quote→authorize→capture→reconcile→revoke
- **P3-O12**: Created `src/integration/chaosProtocol.test.ts` — 9 chaos protocol tests:
  - Revocation cascade under load (5 agents × 2 mandates × 1 wallet)
  - Wallet freeze mid-transaction
  - Evidence freshness failure + budget exhaustion
  - Rail adapter failure propagation (authorize + capture)
  - Counterparty block mid-flow with transition validation
  - Mandate expiry/consumed during authorization (2 sub-tests)
- Total: 726/726 tests pass across 90 files, typecheck clean
- ALL Wave 9 OPUS tasks COMPLETE (O2-O12)

### API corrections discovered
- `WalletPolicyEngine` constructor: `{ now?: () => Date }` (NOT `{ defaultTenantId }`)
- `WalletPolicyEngine` methods: `.upsertPolicy(WalletPolicy)` and `.evaluate(walletId, transaction)` → returns decision object (NOT `.registerPolicy()` / `.evaluateTransaction()`)
- `QuoteService` DOES gate on blocked counterparty status (throws 'Counterparty is blocked')
- Expired/consumed mandates cause 'Payment action denied: active_mandate_required' (not 'Mandate invalid') because VerificationPolicyEngine checks mandate first

### All OPUS Phase 3 tasks COMPLETE
| Task | Description | Status |
|------|-------------|--------|
| P3-O1 | Contract freeze review | PASS |
| P3-O2 | Trust Plane DI wiring | PASS |
| P3-O3 | Evidence Plane DI wiring | PASS |
| P3-O4 | Commerce Plane DI wiring | PASS |
| P3-O5 | Discovery Plane DI wiring | PASS |
| P3-O6 | Gateway DI wiring | PASS |
| P3-O7 | Config fields for Phase 3 | PASS |
| P3-O8 | Trust Plane integration tests | PASS |
| P3-O9 | Evidence Plane integration tests | PASS |
| P3-O10 | Commerce Plane integration tests | PASS |
| P3-O11 | Cross-plane integration tests | PASS |
| P3-O12 | Chaos protocol tests | PASS |

## 2026-03-10 — OPUS Phase 3: P3-O2/O4/O5/O6/O8/O10 (All Planes Wired + Integration Tests)

### What changed
- **P3-O2/O4/O5/O6**: Wired ALL four Phase 3 planes into DI container (`src/server/container.ts`):
  - Trust Plane: TrustAuditLog, AgentIdentityService, MandateService, CounterpartyRegistry, VerificationPolicyEngine, AgentReputationService, RevocationService
  - Commerce Plane: CommerceOrchestrator, ReceiptService, QuoteService, RefundPolicyEngine, SettlementReconciler, DisputeService, 4 rail adapters (Stripe, X402, Coinbase, McpPay), WalletPolicyEngine, WalletBindingService, TreasuryLedger, TreasuryService
  - Discovery Plane: InternalServiceRegistry (as discoveryRegistry), DiscoveryPolicyEngine, ExternalManifestPublisher, ProtocolInjectionSwarm
  - Gateway: InboundTrustMiddleware, CounterpartyRateLimiter, PaymentChallengeMiddleware, AgentGradeApiGateway (wired via `.createMiddleware()`)
  - Container interface expanded with 14 new readonly members. Updated smoke.test.ts stubs.
- **P3-O8**: Created `src/integration/trustPlane.test.ts` — 7 integration tests (identity lifecycle, mandate lifecycle, trust level enforcement L0-L3, counterparty registration/blocking, reputation tracking, cascading revocation, audit trail completeness)
- **P3-O10**: Created `src/integration/commercePlane.test.ts` — 12 integration tests (quote creation, authorize→capture flow, mandate rejection, trust level gate, auto-refund, manual review threshold, refund policy engine, receipt tracking, settlement reconciliation, settlement mismatch, dispute flow, dispute rejection on refunded receipt)
- Total: 711/711 tests pass across 88 files, typecheck clean

## 2026-03-10 — OPUS Phase 3: P3-O1, P3-O3, P3-O7, P3-O9

### What changed
- **P3-O1**: Reviewed contract freeze. Merged Codex (P3-C1/C2/C4/C9) + Gemini (P3-G1–G8) to main. Resolved types.ts merge conflict (indentation). Reconciled Evidence Plane: refactored all evidence files from local `src/evidence/types.ts` to canonical `@shared/types.js`. Added `rawContent?`, `Citation`, `BibliographyEntry` to shared types. Deleted local types file.
- **P3-O7**: Added 15 Phase 3 config fields to `src/shared/config.ts` — trust (3), evidence (3), commerce (4), wallet (2), gateway (3). All zod-validated with env var mapping.
- **P3-O3**: Wired Evidence Plane into DI container (`src/server/container.ts`). 7 services registered: SourcePolicyEngine, EvidenceStore, ClaimExtractor, FreshnessScorer, CitationCompiler, ResearchReportBuilder, ResearchBroker. `proposalSink` wired to `librarian.submitProposal()`. Updated smoke.test.ts for Container interface change.
- **P3-O9**: Created `src/integration/evidencePlane.test.ts` — 6 integration tests (research lifecycle, source policy, tenant isolation, memory proposal guard, budget exhaustion, claim field completeness).
- Total: 473/473 tests pass across 57 files, typecheck clean

### Gotchas
- Gemini's Evidence Plane used local types with different field names (`fetchTimestamp` vs `fetchedAt`, `confidenceScore` vs `confidence`). Always validate subagent type usage against shared types.
- Container wiring went to worktree branch — always merge worktree commits to main before continuing.
- `.claude/worktrees/` was accidentally tracked by git — added to `.gitignore`.
- Evidence services use relative imports (`../evidence/...`) not path aliases — no `@evidence/*` alias exists yet.

## 2026-03-10 — Phase 3 Task Distribution Complete

### What changed
- Analyzed `phase-3-master-blueprint-agent-empire.md` (1050 lines) and distributed 59 tasks across 3 agents
- **CODEX**: 30 tasks (P3-C1–C30, ~55%) — Trust Plane, Commerce Plane, Provider Adapters, Wallet/Treasury, Gateway Hardening
- **GEMINI**: 17 tasks (P3-G1–G17, ~30%) — Evidence Plane, Discovery Plane, Hive Mind V2, Dashboard Components
- **OPUS**: 12 tasks (P3-O1–O12, ~15%) — Contract review, DI wiring, Integration tests, Chaos protocol
- Branch discipline: each agent works in own branch, pushes to main only when task verified
  - Codex: `agent/codex/phase-3-trust-commerce`
  - Gemini: `agent/gemini/phase-3-evidence-discovery`
  - Opus: `agent/opus/phase-3-integration`

### Wave Execution Order
1. Wave 1 (Contract Freeze): P3-C1 + P3-O1 — shared types in types.ts
2. Wave 2 (Trust Plane): P3-C2–C10 — 9 trust services
3. Wave 3 (Evidence Plane): P3-G1–G8 — 8 evidence services
4. Wave 4 (Commerce Core): P3-C11–C17 — 7 commerce services
5. Wave 5 (Provider Adapters): P3-C18–C22 — 5 rail adapters
6. Wave 6 (Wallet & Treasury): P3-C23–C26 — 4 services
7. Wave 7 (Discovery Plane): P3-G9–G12 — 4 services
8. Wave 7b (Hive Mind V2 + Dashboard): P3-G13–G17 — 5 components
9. Wave 8 (Gateway): P3-C27–C30 — 4 gateway services
10. Wave 9 (Integration): P3-O2–O12 — DI wiring, integration tests, chaos protocol

### New Planes (Phase 3)
- **Trust Plane** (`src/trust/`): AgentIdentity, MandateRegistry, VerificationPolicy, CounterpartyRegistry, ReputationEngine, TrustAuditLog, RevocationManager, TrustLevelEnforcer, TrustDIModule
- **Evidence Plane** (`src/evidence/`): ResearchBroker, SourcePolicy, EvidenceStore, ClaimExtractor, FreshnessScorer, CitationLinker, ResearchReportBuilder, EvidenceDIModule
- **Commerce Plane** (`src/commerce/`): CommerceOrchestrator, QuoteEngine, AuthorizationService, CaptureService, SettlementReconciler, DisputeHandler, RefundService, CommerceDIModule
- **Discovery Plane** (`src/discovery/`): InternalServiceRegistry, ExternalManifestPublisher, DiscoveryPolicy, ProtocolInjection
- **Gateway** (`src/gateway/`): AgentGateway, PaymentChallengeMiddleware, InboundTrustVerifier, CounterpartyRateLimiter

### Key Type Additions (Section 9 of blueprint)
- Trust: `AgentIdentity`, `Mandate`, `CounterpartyRecord`, `TrustLevel` (0-4), `TrustAuditEntry`
- Evidence: `EvidenceRecord`, `AtomicClaim`, `ResearchReport`
- Commerce: `CommerceQuote`, `PaymentAuthorization`, `CommerceReceipt`, `CommerceRail`, `CommerceEvent`
- Wallet: `WalletPolicy`, `TreasuryBalance`
- Discovery: `ExternalCapabilityManifest`

## 2026-03-10 — Phase 3 Codex: P3-C1 Contract Freeze

### What changed
- Added all Wave 1 Phase 3 contracts to `src/shared/types.ts` for Trust, Evidence, Commerce, Treasury, and Discovery surfaces.
- Added branded ID aliases plus creators for new entities (`MandateId`, `CounterpartyId`, `QuoteId`, `ReceiptId`, `EvidenceId`, and related audit/event IDs).
- Kept Phase 2 types untouched while introducing additive Phase 3 unions/interfaces (`CommerceRail`, `TrustLevel`, `TrustAuditEntry`, `CommerceEvent`, `ExternalCapabilityManifest`).

### Decisions
- Reused the existing branded-type pattern from `AgentId`/`TaskId` and linked new contracts to existing shared types (`AgentRole`, `AgentId`).
- Preserved separate manifest models: `CapabilityManifest` (internal Phase 2) and `ExternalCapabilityManifest` (Phase 3 discovery edge).

### Architecture Map
- Trust Plane → Commerce Plane → Gateway
- Evidence Plane → Trust/Commerce decision inputs
- Discovery Plane → External capability exposure

### Gotchas
- Full verification stayed green after contract freeze (`npx tsc --noEmit`, `npx vitest run`: 406/406 passing).

## 2026-03-10 — Branch Ownership Discipline (Codex)

### What changed
- Added an explicit operating rule: Codex must always return to and work from `codex/phase-3-trust-commerce` before making edits.
- Confirmed parallel multi-agent work is safe when each agent stays on its own branch.

### Decisions
- Branch pre-flight is mandatory before edits and commits: run `git branch --show-current`.
- If current branch is not Codex-owned, immediately switch back before proceeding.

### Gotchas
- Concurrent agent activity can change repo context visibility; enforce branch checks at every task boundary to prevent cross-branch contamination.

## 2026-03-08 — Phase 2 OPUS Complete: P2-O4 through P2-O8
### What changed
- **P2-O4**: EvalPipeline.ts AuditMinion front-run — optional IAuditMinion (5th constructor param), Stage 0 audit before deterministic eval (reject→Fail, warn→continue, pass→silent). `EvalInput` gained `agentId`, `EvalStage` expanded with `'audit'`. 4 new tests.
- **P2-O5**: BudgetGovernor.ts telemetry hooks — optional ITelemetryMinion (2nd constructor param), `recordUsage()` forwards to telemetry, `checkBudget()` calls `detectAnomalies()` and emits BudgetWarning on critical. 4 new tests.
- **P2-O6**: `src/integration/controlPlane.test.ts` — 4 integration tests (happy path, worker failure → retry, retry limit → escalation, budget trip). Uses real DispatcherMinion + AuditMinion, mocked evaluators.
- **P2-O7**: `src/integration/memoryProposal.test.ts` — 5 integration tests (proposal→knowledge, duplicate rejection, tenant isolation, empty content rejection, low confidence acceptance). Uses real MemoryPolicy, AtomicFactExtractor, RetrievalPolicyEnforcer.
- **P2-O8**: `src/integration/checkpointMechanic.test.ts` — 14 integration tests across 4 describe blocks (checkpoint save/resume, ActionPolicy whitelist, MechanicAuditLog CRUD, end-to-end Mechanic safety pipeline). Uses real ActionPolicy, MechanicRequestValidator, MechanicAuditLog.
- Total: 406/406 tests pass across 48 files, typecheck clean

### Gotchas
- `MemoryKind` is a **type union** NOT a const object — use `'observation' as MemoryKind`
- `AgentHandle` has many required fields (agentId, roleName, createdAt, budgetAllocated, toolBundleResolved, memoryPolicyResolved, lineage, provenanceHash, status) — use `as unknown as AgentHandle` for test fixtures
- `RetrievalPolicyEnforcer.enforce()` requires full `RetrievalPolicy` object (tenantId, includeGlobalArchitecture, maxFacts, maxTokens, allowedKinds), NOT just `{ tenantId }`
- MemoryPolicy does NOT gate on confidence — only checks tenant, title, rawContent, writer, sensitive patterns, content length
- AtomicFactExtractor output is non-deterministic — assert `length >= 1`, don't match specific strings
- `MechanicAuditLog` uses temp file path for tests — clean up in `afterEach`
- **Subagent worktree drift**: parallel subagents may write to worktree vs main — always verify file locations after subagent completion before committing

### All OPUS Phase 2 tasks COMPLETE
| Task | Description | Status |
|------|-------------|--------|
| P2-O1 | IJarvis.ts refactor | ✅ |
| P2-O2 | Jarvis.ts PlanEnvelope handoff | ✅ |
| P2-O3 | Jarvis.test.ts Phase 2 tests | ✅ |
| P2-O4 | EvalPipeline AuditMinion front-run | ✅ |
| P2-O5 | BudgetGovernor telemetry hooks | ✅ |
| P2-O6 | controlPlane.test.ts integration | ✅ |
| P2-O7 | memoryProposal.test.ts integration | ✅ |
| P2-O8 | checkpointMechanic.test.ts integration | ✅ |

## 2026-03-08 — Phase 2 P2-O3: Jarvis PlanEnvelope Tests
### What changed
- Added 6 new tests to `Jarvis.test.ts` in `describe('Phase 2 — PlanEnvelope behavior')`
- Tests cover: createPlan field validation, escalationPolicy defaults, retrievalPolicy tenant scoping, dispatcher.accept() on processGoal, dispatcher delegation on executeDAG, dispatcher.escalate() on handleEscalation
- Total: 261/261 tests pass across 28 files

### Next OPUS tasks
- P2-O4: EvalPipeline.ts front-run with AuditMinion (blocked by P2-G2 — GEMINI's AuditMinion)
- P2-O5: BudgetGovernor.ts telemetry hooks (blocked by P2-G1 — GEMINI's TelemetryMinion)
- P2-O6-O8: Integration tests (blocked by CODEX Dispatcher + memory spine + checkpointing)

## 2026-03-08 — Phase 2 P2-O1 + P2-O2: Jarvis Handoff Refactor
### What changed
- **P2-O1**: `IJarvis.ts` refactored — added `createPlan(goal, tenantId) → PlanEnvelope`, `handleEscalation(planId, reason) → PlanEnvelope|null`, `executeDAG` marked `@deprecated`
- **P2-O2**: `Jarvis.ts` fully implements PlanEnvelope handoff:
  - `createPlan()` — analyzes goal → decomposes → validates DAG → builds typed PlanEnvelope with defaults
  - Constructor accepts optional `IDispatcher` (4th param, backward compat)
  - `processGoal()` dispatches via `dispatcher.accept()` when injected
  - `executeDAG()` delegates to dispatcher when available, preserves legacy execution loop
  - `handleEscalation()` Phase 2 path wired to `dispatcher.escalate()`
- 255/255 tests pass, typecheck clean
- `IDispatcher` interface exists at `src/orchestrator/IDispatcher.ts` (created by CODEX)

### Constructor signature (current)
```typescript
constructor(
  goalAnalyzer: GoalAnalyzer,
  taskExecutor: TaskExecutor,
  config?: Partial<JarvisConfig>,
  dispatcher?: IDispatcher
)
```

### Gotchas
- `AgentHandle` in `@shared/types` is the full factory output shape, NOT just `{agentId, role, modelTier}`. Building one requires `AgentRole`, `AgentStatus`, `MemoryMode`, `SandboxNetwork`, `createAgentId` imports.
- `IDispatcher` is optional in constructor — tests without dispatcher still work via legacy execution path
- `processGoal` still returns `TaskDAG | ClarificationRequest` — dispatcher dispatch is a side effect, not a return value change

## 2026-03-08 — Phase 2 Task Breakdown + Worktree Lesson
### What changed
- Created Phase 2 task breakdown across all agent assignment files:
  - CODEX: 26 tasks (P2-C1 to P2-C26) — contract freeze, Dispatcher, memory spine, checkpointing, Mechanic safety, capability manifests
  - GEMINI: 10 tasks (P2-G1 to P2-G10) — minions, dashboard updates, dynamic tool loading, ApiGateway manifest
  - OPUS: 8 tasks (P2-O1 to P2-O8) — Jarvis handoff refactor, EvalPipeline/Governor hooks, integration tests
- Merged `claude/clever-austin` worktree branch into `main` so all agents can read their assignments
- Phase 2 contracts (P2-C1) already present in `src/shared/types.ts` — pre-done from AGENTS.md rewrite

### Gotchas
- **Worktree isolation**: Claude Code worktrees are invisible to CODEX/GEMINI/other agents. Any deliverable meant for other agents MUST be committed to `main`, not a worktree branch. Always ask: "can the target agent reach this file?"
- Phase 12 tracker should be updated to reflect P2-C1 contracts are already frozen
## 2026-03-04 — Initial Phase Implementations by GEMINI
### What changed
- Completed Phase 8 (Worker Templates): Created `IWorker` and implemented `DataScraper`, `Summarizer`, `GitCommitter`, `ContentFormatter`, `SchemaValidator`, `ApiCaller`, `NotificationSender`, and `DataTransformer` with 100% test coverage.
- Started Phase 9 (Tool Primitives): Built the Database schemas, Operations, and MCP Endpoints for `ContentScheduler` and `AnalyticsCollector` with full test coverage.
- Updated `AGENTS.md` and `CHANGELOG.md` to show Phase 8 as `PASS`, Phase 9 as `IN_PROGRESS` (waiting on CODEX part), and Phase 10 as `BLOCKED: Waiting on Phase 5`.

### Gotchas
- Drizzle ORM mock chaining in tests requires `where: vi.fn().mockReturnThis()` so that `.returning()` can properly execute during Vitest runs.
- Use typed output interfaces in test assertions instead of `as any` casts. Define small interfaces per test suite matching the worker's output shape.

## 2026-03-04 — Phase 10: Dashboard Components
### What changed
- Completed Phase 10 (Dashboard Components): Built React UI components for the unified orchestration UI (`AgentStatusCard`, `BusinessMetricsPanel`, `ChatInterface`, `EventFeed`, `HitlApprovalQueue`, `TaskDAGViewer`, and `BudgetVisualization`).
- Used `recharts` and Tailwind CSS to style visualization blocks correctly.
- Discovered and fixed an orchestrator mapping oversight in `src/orchestrator/Jarvis.ts` left by OPUS where Typescript was correctly inferring that `string[]` cannot be implicitly defined as `TaskId[]`.

### Gotchas
- Recharts `Tooltip` formatter callbacks should omit explicit type annotations — TypeScript infers the correct `ValueType` from recharts generics. Do NOT use `: any`.
- For dynamic property access on `unknown[]` items, use `as Record<string, unknown>` instead of `as any`.

## 2026-03-04 — QA Remediation: Type Safety Hardening
### What changed
- Eliminated ALL `any` usage from GEMINI-owned production and test files
- `BudgetVisualization.tsx`: Removed `: any` from recharts formatter params (TypeScript infers types)
- `DataTransformer.ts`: Replaced 4× `as any` with `as Record<string, unknown>` for dynamic property access
- `TaskDAGViewer.tsx`: Changed relative import to `@orchestrator/TaskDAG` path alias
- Test files (ApiCaller, DataScraper, NotificationSender, SchemaValidator): Replaced all `as any` casts with typed `fetchMock` variables and output interfaces

### Gotchas
- Use `global.fetch = fetchMock as unknown as typeof fetch` pattern for typed fetch mocking (double-cast avoids `as any`)
- Remaining `as any` in `Jarvis.ts` is OPUS-domain — do not modify

## 2026-03-04 — QA Remediation: CODEX Primitives DRY Consolidation
### What changed
- Created `src/primitives/db.ts` with shared `QueryChain<T>` and `PrimitiveDb` interfaces
- Removed 3 duplicated `QueryChain` + DB interface definitions from LeadTracker, ApiGateway, and WebhookManager operations files
- Each primitive now imports from `@primitives/db` and narrows via `Pick<>` as needed

### Gotchas
- Use `Pick<PrimitiveDb, 'insert' | 'select'>` pattern to narrow the DB interface per-primitive rather than defining separate interfaces
- `QueryChain<T>` uses default generic `T = Array<Record<string, unknown>>` so callers can omit the type parameter

## 2026-03-08 — Production Hardening (Codex Tasks)
### What changed
- Added `tsconfig.build.json` and switched `build` script to emit `dist/` via `tsc -p tsconfig.build.json`.
- Added flat ESLint config in `eslint.config.mjs`, installed `@typescript-eslint/parser`, and normalized `lint` script to `eslint src/`.
- Added containerization artifacts: `Dockerfile` (multi-stage), `docker-compose.yml` (api + pgvector + redis), and `.dockerignore`.
- Added CI workflow at `.github/workflows/ci.yml` running typecheck, test, lint, and build on `push`/`pull_request` to `main`.

### Decisions
- Left Task 12 (`/health` + `/metrics` route update) pending because `src/server/routes.ts` is not present yet (Task 6 dependency missing on branch).

### Gotchas
- This branch already contained Wave 1 hardening commits from other agents (`logger`, `config`, `.env.example`); Codex changes were layered on top without rewriting those files.

## 2026-03-08 — Production Hardening: Gemini Tasks T5/T7/T15

### What changed
- **T5 (README.md)**: Created project README (83 lines) with quickstart, project structure, agent roles, tech stack, and architecture sections. No emojis, no ASCII art.
- **T7 (next.config.mjs)**: Created `src/dashboard/next.config.mjs` with `output: 'standalone'`, `ignoreBuildErrors: false`, `ignoreDuringBuilds: true` (ESLint only).
- **T15 (Error Boundaries)**: Created `src/dashboard/components/ErrorBoundary.tsx` (React class component with 'use client' directive) and wrapped `{children}` in `src/dashboard/app/layout.tsx`.
- All commits on branch `prod-hardening`.
- Typecheck: PASS (0 errors). Tests: 180/180 PASS.

### Gotchas
- `prod-hardening` branch did not exist — created fresh from `agent/gemini/dashboard-components` after stashing local changes.
- ErrorBoundary requires `'use client'` directive since React class-based error boundaries are client components only in Next.js 14 App Router.

## 2026-03-08 — Production Hardening: OPUS Tasks T9/T10/T16 (via Gemini)

### What changed
- **T9 (LlmGoalAnalyzer)**: Created `src/orchestrator/LlmGoalAnalyzer.ts` — injectable `LlmProvider`, zod validation of LLM JSON output, graceful fallback to single-node DAG on parse/provider errors. Extracts completeness fields and decomposes goals into multi-node TaskDAGs with dependency wiring by index.
- **T10 (WorkerTaskExecutor)**: Created `src/orchestrator/WorkerTaskExecutor.ts` — routes DAG nodes to Workers by `assignedRole` via `WorkerRegistry` (Map\<string, IWorker\>), runs EvalPipeline on output, records budget via Governor. Non-blocking on governor failures. Builds TaskSpec from DAGNode.
- **T16 (smoke.test.ts)**: Created `src/server/smoke.test.ts` — 7 E2E tests: health check, goal→DAG→execute lifecycle, agent CRUD, metrics, knowledge query. Uses test container with stub providers (no Docker/DB needed).
- 14 tests for LlmGoalAnalyzer, 11 tests for WorkerTaskExecutor, 7 smoke tests → 32 new tests.
- Total: 212/212 tests, 23 test files, typecheck PASS, 0 `any`, 0 `@ts-ignore`.

### Gotchas
- `extractJson()` helper in LlmGoalAnalyzer tries direct parse, then markdown code block extraction, then brace-matching — handles real LLM output patterns.
- Smoke test uses a stub mechanic cast (`as unknown as Mechanic`) because `Mechanic` constructor requires real provisioner deps; test only exercises API routes.
- `WorkerTaskExecutor.governorAgentId` is optional — if omitted, budget recording is skipped (useful for tests).

## 2026-03-08 — Production Hardening: HAIKU Task T11

### What changed
- **T11 (CORS + Rate Limiting Middleware)**: Implemented an in-memory Rate Limiter in `src/server/middleware.ts` using `Map<string, {count, resetAt}>`. Configured via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` environment variables. Protects endpoints by returning `429 Too Many Requests` when limits are exceeded. Includes a `setInterval` memory cleanup task to prevent memory leaks from inactive IPs.
- Created `src/server/middleware.test.ts` with 4 tests verifying header injection, blocking functionality, IP isolation, and time-based resets.
- Added 4 tests bringing total test count to 216/216. Typecheck passed.

### Gotchas
- The `setInterval` requires `.unref?.()` to prevent blocking process exit in Node, ensuring test runners like Vitest can exit cleanly without hanging.

## 2026-03-08 — Live Wiring: Stubs → Real LLM Orchestration

### What changed
- **AnthropicProvider** (`src/orchestrator/AnthropicProvider.ts`): Fetch-based `LlmProvider` implementation hitting Anthropic Messages API. No SDK dependency. Reads `ANTHROPIC_API_KEY` from config.
- **ResearchWorker** (`src/workers/ResearchWorker.ts`): First concrete `IWorker` — sends task descriptions to LLM, returns markdown research output. Estimates token usage for budget tracking.
- **Config** (`src/shared/config.ts`): Added `anthropicApiKey` optional field (maps to `ANTHROPIC_API_KEY` env var).
- **index.ts**: Auto-detects `ANTHROPIC_API_KEY`. If present, builds real `LlmGoalAnalyzer` + `WorkerTaskExecutor` + `ResearchWorker`. If absent, falls back to stubs with a warning log.
- Worker registry maps `Worker`, `Researcher`, and `Implementer` roles to `ResearchWorker` as a generic fallback.
- 216/216 tests, 24 test files, typecheck PASS.

### Gotchas
- `Jarvis` stores `taskExecutor` as `private readonly` — no setter. So `WorkerTaskExecutor` must be constructed *before* `createContainer` and passed in directly.
- `AnthropicProvider` uses raw `fetch` to avoid needing `@anthropic-ai/sdk` as a dependency.
- To test with real LLM: create `.env` with `ANTHROPIC_API_KEY=sk-ant-...` then `npm run dev`.

## 2026-03-08 — Phase 2 Codex: Contracts + Memory Spine Foundation
### What changed
- Added Phase 2 shared contracts to `src/shared/types.ts` (ExecutionStatus/PlanEnvelope/DispatcherState, Memory V2, checkpoint, mechanic request, capability manifest).
- Added dispatcher contracts/utilities: `src/orchestrator/IDispatcher.ts`, `src/orchestrator/runtimeState.ts`, and `src/orchestrator/runtimeState.test.ts`.
- Added memory-spine modules with tests: `memoryTypes`, `MemoryPolicy`, `AtomicFactExtractor`, `RetrievalPolicyEnforcer`, and `MemoryProposalPipeline`.
- Upgraded `ILibrarian`/`Librarian` to support V2 methods (`submitProposal`, `queryV2`) while preserving existing V1 ingest/query/prune/resolveConflict behavior.
- Updated worker memory flow: `WorkerResult` now supports `memoryProposals`, and `WorkerTaskExecutor` routes proposals through `Librarian.submitProposal` with tests.

### Decisions
- Kept V2 storage backward-compatible by extending `ILibrarianStore` with optional `saveV2/listByTenantV2` and using an internal fallback map when adapters are missing.
- Deferred Dispatcher wiring into `container.ts` (`P2-C5`) to avoid overlap with OPUS Jarvis handoff work (`P2-O1/P2-O2`).

### Gotchas
- `codex/phase-2-hardening` did not yet contain Phase 2 shared contracts; missing exports blocked typecheck until `src/shared/types.ts` was updated first.

## 2026-03-08 — Phase 15, 17, 18 (Partials, GEMINI)
### What changed
- **Phase 15 (AuditMinion, SecretLeakScanner, SchemaConformanceChecker)**: Created pre-screening agents to evaluate worker outputs before the EvalPipeline. Included regex and entropy-based secret scanning, Zod schema conformance checking, and safety checks.
- **Phase 17 (ToolDiscoveryService, DomainToolRegistry)**: Created generic tool capabilities spanning discovering tools by domain/task type, avoiding LLM calls for deterministic retrieval.
- **Phase 18 (ApiGateway Manifest)**: Initialized `src/primitives/ApiGateway/manifest.ts` factory for CapManifests.
- **Status Update**: Logged blocked tasks in `GEMINI-ASSIGNMENT.md`. P2-G1, P2-G3, P2-G6, P2-G7 are blocked by CODEX completing P2-C5 (Dispatcher wired).

### Gotchas
- `IBudgetGovernor` did not have an explicit event emitter interface yet, blocking TelemetryMinion's implementation directly on that front.
- `JSON.stringify` escapes quotes, which required careful regex crafting inside of tests for Injection/Secret leaks.

## 2026-03-08 — Phase 12 Codex: Dispatcher Runtime + Container Wiring
### What changed
- Added `DispatcherMinion` runtime controller in `src/orchestrator/DispatcherMinion.ts` with deterministic scheduling, retries, wait/hibernate handling, and typed escalation triggers.
- Added `src/orchestrator/DispatcherPlanRunner.ts` to keep dispatcher execution logic isolated and file sizes within limits.
- Wired dispatcher into DI container (`src/server/container.ts`) and Jarvis constructor injection for plan handoff execution path.
- Added `src/orchestrator/DispatcherMinion.test.ts` with 12 coverage scenarios (dependency ordering, retries, retry-limit escalation, budget escalation, pause/resume, concurrency, wait/hibernate, checkpoint serialization, unsafe/eval escalation).
- Added checkpoint interface contract `src/runtime/checkpoints/ICheckpointStore.ts` and config fields for durability controls in `src/shared/config.ts`.
- Updated `src/server/smoke.test.ts` and `runtimeState` tests to align with dispatcher wiring and retry-pending transitions.

### Decisions
- Kept checkpoint integration behind an optional store interface to avoid blocking current runtime while Wave 5 stores are implemented.
- Preserved compatibility with existing routes/tests by adding dispatcher to container shape rather than replacing existing components.

### Gotchas
- Used a dedicated worktree (`../agent-empire-codex`) because the root repo had an unresolved merge state; all continuing Codex edits were performed in the worktree.

## 2026-03-08 — Phase 14 Codex: Checkpoint Stores + Resumer + Wait Scheduler
### What changed
- Added `PostgresCheckpointStore` and `RedisCheckpointStore` implementations with full CRUD/list behavior and deterministic tests.
- Added `WorkflowResumer` to rehydrate `DispatcherState`, validate checkpoint/envelope consistency, and escalate durability faults.
- Added `WaitConditionScheduler` to register/tick waits, resolve external events, and persist waiting snapshots through checkpoint store.
- Extended `WorkerTaskExecutor` with optional `ICheckpointStore` integration, saving checkpoints on success and failure paths.
- Restored and extended `WorkerTaskExecutor.test.ts` with checkpoint coverage after a malformed append corrupted the file.

### Decisions
- Kept checkpoint persistence fail-fast in `WorkerTaskExecutor` when a checkpoint store is configured and `save()` throws.
- Left checkpoint modules constructor-injected and infrastructure-agnostic (`PostgresCheckpointDb` and `RedisLike`) to avoid coupling runtime logic to specific clients.

### Gotchas
- `@runtime/*` path alias is not configured; runtime imports must be relative paths until aliases are expanded in `tsconfig.json`.

## 2026-03-08 — Phase 16 Codex: Mechanic Safety Hardening
### What changed
- Added `ActionPolicy`, `MechanicRequestValidator`, and `MechanicAuditLog` (with tests) to enforce whitelisted, validated, auditable mechanic requests.
- Added `MechanicActionExecutor` and `MechanicStateStore` to keep `Mechanic.ts` bounded while routing actions through structured handlers.
- Extended `IMechanic` with `executeRequest(request: MechanicRequest)` and `MechanicActionResult`.
- Refactored `Mechanic.provisionBusinessUnit` to execute `create_database`, `create_repo`, and `start_container` via request-gated action execution.
- Updated `DockerProvisioner` and `DatabaseProvisioner` to log operational failures explicitly.

### Decisions
- Kept `/api/businesses` compatibility by preserving `provisionBusinessUnit` while enforcing request validation/policy/audit under the hood.
- Treated policy or payload failures as rejected actions (no implicit fallback execution).

### Gotchas
- Mechanic request payloads are validated as plain objects; branded IDs are reconstructed in action execution when calling provisioners.

## 2026-03-08 — Phase 18 Codex: Capability Manifest Indexing
### What changed
- Added `CapabilityManifestWriter` and `InternalRegistry` with tests for proposal writing and tenant/business/service lookup.
- Added `createCapabilityManifestProposal` in `Librarian.ts` so capability manifests are normalized into `MemoryProposal` records.
- Added `MechanicActionExecutor` manifest emission for `generate_manifest` and `deploy_gateway` actions.
- Wired `Mechanic` to upsert emitted manifests into `InternalRegistry` and submit them through `CapabilityManifestWriter`.
- Updated container wiring to provide `CapabilityManifestWriter` + `InternalRegistry` to `Mechanic`.

### Decisions
- Kept capability publication as structured JSON proposal writes (`kind: capability_manifest`) rather than narrative memory ingestion.
- Preserved backward compatibility by keeping existing mechanic APIs while adding manifest emission on deploy-related actions.

### Gotchas
- `Mechanic` now depends on optional manifest sinks; if not injected, deploy actions still execute but won’t persist manifests.

## 2026-03-08 — Phase 15 Gemini: Telemetry & Dashboard Analytics
### What changed
- Added `TelemetryMinion` to track token burn rates, detect anomalies (spikes/sustained burns), calculate burn trends, and emit structured warnings.
- Added `TokenBurnAnalyzer` to deterministically suggest budget overrides (expand/shrink) and tier (fast/frontier) based on historical usage percentiles.
- Updated `EventFeed.tsx` to distinctly render and emphasize `budget.warning`, `eval.escalated`, and `circuit_breaker.tripped` telemetry events with custom styling.
- Updated `BudgetVisualization.tsx` to include an overlaid Token Burn Analytics Bar/Line chart mapping usage over time and highlighting spike/burn anomalies.

### Decisions
- Kept `TokenBurnAnalyzer` purely deterministic without any LLM calls, strictly relying on configurable percentile/threshold heuristics from historical usage.

### Gotchas
- `IBudgetGovernor` does not naturally emit events under the `EventEmitter` model out-of-the-box in the same way `SystemEvent` works inside the minion; the minion relies on injected global emitter for `CircuitBreakerTripped`.

## 2026-03-10 — Merge Conflict Protocol Update
### What changed
- Updated git merge conflict resolution rules based on user feedback.

### Gotchas
- **CRITICAL - Merge Conflict Protocol**: Before resolving ANY merge conflict, ensure no other agents (CODEX, OPUS, GEMINI) are actively working.
- Only merge to `main` what comes from YOUR specific branch.
- Resolving merge conflicts on shared files while other agents are actively coding causes major workflow issues, as they will start writing to the wrong branch. Do not resolve conflicts on shared files (like `types.ts`) without explicit coordination if other agents are active.

## 2026-03-10 — Phase 3 Trust Plane: Reputation + Revocation
### What changed
- Added `AgentReputationService` with event-based trust scoring/reporting and deterministic tests (`src/trust/AgentReputationService.ts`, `src/trust/AgentReputationService.test.ts`).
- Added `RevocationService` + `RevocationSupport` to implement tenant-safe agent/mandate/counterparty revocation and wallet freeze flows with audit + `SystemEvent` emission (`src/trust/RevocationService.ts`, `src/trust/RevocationSupport.ts`, `src/trust/RevocationService.test.ts`).
- Updated `CODEX-ASSIGNMENT.md` statuses: `P3-C8` and `P3-C10` marked `PASS`.

### Decisions
- Architecture map: `AgentIdentityService` + `MandateService` + `CounterpartyRegistry` -> `RevocationService` -> `TrustAuditLog` + `EventEmitter(SystemEvent)`.
- Kept revocation side effects idempotent (`already revoked/blocked/frozen` returns no-op behavior) to make retry paths safe.

### Gotchas
- `IssueAgentIdentityParams` does not accept direct `agentId`; tests must create identities through `ownerId` and use returned branded IDs.

## 2026-03-10 — Phase 3 Commerce + Gateway Buildout

### What changed
- Completed Phase 3 commerce contracts/core execution path through `P3-C17` and finished Wave 5 (`P3-C18`–`P3-C22`) with stubbed rail adapters: Stripe, x402, Coinbase Wallet, MCP Pay, and AP2 mandate adapter.
- Completed Wave 6 (`P3-C23`–`P3-C26`) with `WalletPolicyEngine`, `WalletBindingService`, `TreasuryLedger`, and `TreasuryService` (append-only treasury journaling + wallet policy enforcement).
- Completed Wave 8 (`P3-C27`–`P3-C30`) with `AgentGradeApiGateway`, `InboundTrustMiddleware`, `CounterpartyRateLimiter`, and `PaymentChallengeMiddleware`, plus full test coverage for each module.

### Decisions
- Kept Phase 3 adapters deterministic and in-memory by design (contract-faithful stubs only; no external provider calls), matching Phase 3 guardrails.
- Split treasury helpers into `TreasuryServiceSupport.ts` to maintain file-size constraints and keep service orchestration logic bounded.
- Architecture map: `AgentGradeApiGateway -> InboundTrustMiddleware -> CounterpartyRateLimiter -> PaymentChallengeMiddleware -> RouteHandler`; `CommerceOrchestrator -> RailAdapters -> ReceiptService/DisputeService/SettlementReconciler`; `WalletPolicyEngine -> TreasuryService -> TreasuryLedger`.

### Gotchas
- Full-suite runs can occasionally show a transient `TelemetryMinion` anomaly test failure; isolated rerun passed and subsequent full-suite rerun passed.
- `TrustAuditEntry.eventType` lacks a wallet-unbound-specific variant, so wallet unbind audit records use `verification_override` with explicit `action: wallet_unbound` details.

## 2026-03-10 — Phase 3 Hive Mind V2 & Dashboard Components
### What changed
- Extended `MemoryKind` union in `@shared/types` to support Hive Mind V2 namespaces (`research_facts`, `identity_records`, `commerce_records`, `counterparty_records`, `incident_records`).
- Updated `RetrievalPolicyEnforcer` and `RetrievalPolicy` interface to support scoring filters: `minFreshnessScore`, `minTrustScore`, and `requireProvenance`.
- Implemented `TrustDashboard.tsx`, `CommerceActivityPanel.tsx`, `EvidenceViewer.tsx`, and `DiscoveryPanel.tsx` React components for the dashboard.
- Resolved TypeScript `any` and Recharts typing issues to strictly conform to project style guidelines.

### Decisions
- Recharts `Tooltip` formatter needs explicit optional chaining (`value?: number`) to avoid type mismatch since recharts can occasionally pass `undefined`.
- Dashboard components are read-only views mirroring the hub-and-spoke isolation model for Agent Empire.

### Gotchas
- Always calculate aggregate freshness on the fly when the parent report lacks computed aggregations.
- Recharts `value` property inside `Tooltip` formatters can be undefined despite seemingly typed otherwise.
