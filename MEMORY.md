# Agent Empire: Project Memory

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
