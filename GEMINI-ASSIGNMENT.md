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
| P2-G1 | Create `src/minions/TelemetryMinion.ts` + tests | 4 | 15 | P2-C5 (Dispatcher wired) | 🛑 BLOCKED:P2-C5 |
| P2-G2 | Create `src/minions/AuditMinion.ts` + tests | 4 | 15 | P2-C1 (contracts) | ✅ PASS |
| P2-G3 | Create `src/minions/TokenBurnAnalyzer.ts` + tests | 4 | 15 | P2-G1 | 🛑 BLOCKED:P2-G1 |
| P2-G4 | Create `src/minions/SecretLeakScanner.ts` + tests | 4 | 15 | P2-G2 | ✅ PASS |
| P2-G5 | Create `src/minions/SchemaConformanceChecker.ts` + tests | 4 | 15 | P2-G2 | ✅ PASS |
| P2-G6 | Update `EventFeed.tsx` — render telemetry/audit events | 4 | 15 | P2-G1, P2-G2 | 🛑 BLOCKED:P2-G1 |
| P2-G7 | Update `BudgetVisualization.tsx` — anomaly markers | 4 | 15 | P2-G3 | 🛑 BLOCKED:P2-G3 |
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

## What You Do NOT Build

- Dispatcher, Librarian V2, Checkpointing, Mechanic Safety, Capability Manifests (CODEX)
- Jarvis refactor, EvalPipeline modifications, BudgetGovernor hooks, Integration tests (OPUS)

Do not touch files owned by other agents. Mock missing interfaces in tests.

---

## Launch Prompt

```
Read AGENTS.md Sections 1-9 and Appendices A-F. Then read GEMINI-ASSIGNMENT.md.
Execute Phase 2 tasks in wave order (4 → 7 → 8).
Wave 4 depends on P2-C1 (contracts) and P2-C5 (Dispatcher wired). If not ready, start P2-G2 (AuditMinion depends only on contracts).
Commit after each minion/component/module.
Run `npx tsc --noEmit && npx vitest run` after each task.
Continue until all tasks show PASS or are BLOCKED.
```
