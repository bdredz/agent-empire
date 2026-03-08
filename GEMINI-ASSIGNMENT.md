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

## What You Do NOT Build

- Agent Factory, Evaluation Engine, Jarvis Orchestrator, Integration (OPUS)
- Budget Governor, Mechanic, Librarian, Dashboard Scaffold (CODEX)

Do not touch files owned by other agents. Mock missing interfaces in tests.

---

## Quality Checklists

**Per Worker:** Implements IWorker, 5+ tests, Fast/Tiny tier, stateless, structured WorkerResult, passes typecheck.

**Per Component:** Typed props, handles loading/empty/error states, Tailwind only, no hardcoded data, passes typecheck, builds clean.

---

## Launch Prompt

```
Read AGENTS.md Sections 0-2. Then read GEMINI-ASSIGNMENT.md.
Execute any incomplete tasks. Follow the autonomous loop in AGENTS.md Section 2.1.
Commit after each individual worker or component.
Run `npx tsc --noEmit && npx vitest run` after each task.
Continue until all tasks show PASS or are BLOCKED.
```
