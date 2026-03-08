# Agent Empire: Project Memory

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
