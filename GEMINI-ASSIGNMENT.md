# GEMINI-ASSIGNMENT.md — Phases Assigned to Gemini 3.5 Pro

---

## YOUR ROLE

You are GEMINI. You build the worker templates, dashboard components,
and tool primitives. Your work is self-contained — each deliverable
is an independent module with no cross-dependencies on other modules
you're building.

**Read AGENTS.md first.** It contains your operating rules, the full
phase definitions, and the shared types you MUST import from.
No workflows directory exists for this project — skip that check.
---

## YOUR ASSIGNED PHASES (in order)

### Phase 8: Worker Templates
**Branch:** `agent/gemini/worker-templates`
**Priority:** HIGH — workers are needed for first business launch
**Full spec:** See AGENTS.md Phase 8

Build each worker as a self-contained module. Each worker:
1. Implements the `IWorker` interface
2. Receives a `TaskSpec` as input
3. Returns structured artifacts as output
4. Has a colocated test file with minimum 5 tests
5. Uses Fast or Tiny model tier only (specified in implementation)
6. Is stateless — no persistent memory between invocations
7. Cannot spawn child agents

**Workers to build (one at a time, commit after each):**
1. `DataScraper.ts` — accepts URL, returns structured JSON
2. `Summarizer.ts` — accepts long text, returns condensed bullets
3. `GitCommitter.ts` — accepts diff + context, returns formatted commit message
4. `ContentFormatter.ts` — transforms between markdown/html/json/text
5. `SchemaValidator.ts` — validates JSON against Zod schema
6. `ApiCaller.ts` — makes structured HTTP requests, parses responses
7. `NotificationSender.ts` — sends alerts to configured channels
8. `DataTransformer.ts` — ETL: filter, map, aggregate structured data

**IWorker interface (define this first):**
```typescript
export interface IWorker {
  readonly name: string
  readonly modelTier: ModelTier
  readonly capabilities: Capability[]
  execute(spec: TaskSpec): Promise<WorkerResult>
}

export interface WorkerResult {
  readonly success: boolean
  readonly artifacts: ArtifactId[]
  readonly output: unknown  // typed per worker
  readonly usage: BudgetUsage
  readonly errors?: string[]
}
```

### Phase 10: Dashboard Components
**Branch:** `agent/gemini/dashboard-components`
**Priority:** MEDIUM — visual layer for monitoring
**Full spec:** See AGENTS.md Phase 10

Build each component independently. Each component:
1. Is a React functional component with TypeScript
2. Uses Tailwind for styling (utility classes only)
3. Receives typed props (define prop interface in same file)
4. Uses Zustand store for state where needed
5. Has no external dependencies beyond the locked stack

**Components to build (one at a time):**
1. `AgentStatusCard.tsx` — displays agent role, status badge, budget bar
2. `BusinessMetricsPanel.tsx` — revenue/cost/failure metrics per business
3. `ChatInterface.tsx` — text input + message history + send to API
4. `EventFeed.tsx` — scrolling list of SystemEvents with severity colors
5. `BudgetVisualization.tsx` — bar/pie charts using recharts (available in stack)
6. `HitlApprovalQueue.tsx` — pending approvals with approve/deny buttons
7. `TaskDAGViewer.tsx` — simple tree/graph visualization of task dependencies

### Phase 9 (partial): Tool Primitives — ContentScheduler, AnalyticsCollector
**Branch:** `agent/gemini/tool-primitives`
**Priority:** LOWER — needed before scaling
**Full spec:** See AGENTS.md Phase 9

Each primitive is a self-contained module with:
- Database schema (Drizzle ORM)
- MCP endpoint definitions
- CRUD operations
- Test file with minimum 5 tests

---

## PARALLEL EXECUTION RULES

Phase 8 (Worker Templates) can start IMMEDIATELY — it depends
only on Phase 0 (types), which is already complete.

Phase 10 (Dashboard Components) can start after Phase 5
(Dashboard Scaffold, built by CODEX) is merged. Build against
the Zustand store interfaces even if scaffold isn't ready.

Phase 9 (your portion) can start after Phase 0. No dependency
on the Mechanic since you're building the module, not deploying it.

---

## COORDINATION PROTOCOL

1. **Always work in your assigned branch.** Never push to main.
2. **Import types ONLY from `src/shared/types.ts`.**
3. **Commit after each completed worker/component.**
   One worker = one commit. One component = one commit.
4. **If you need a type that doesn't exist,** note it in your
   BLOCKED message. Do not invent types.
5. **Each file must pass typecheck independently.**
   Run `npx tsc --noEmit` after each file.

---

## WHAT YOU DO NOT BUILD

- Agent Factory (OPUS)
- Budget Governor (CODEX)
- Evaluation Engine (OPUS + CODEX)
- Mechanic Agent (CODEX)
- Dashboard Scaffold (CODEX) — you build components INTO the scaffold
- Librarian Agent (CODEX)
- Jarvis Orchestrator (OPUS)
- Integration (OPUS)

---

## QUALITY CHECKLIST PER WORKER

Before marking a worker as complete:
- [ ] Implements IWorker interface exactly
- [ ] Has 5+ tests covering: happy path, empty input, malformed input, 
      budget constraint, error handling
- [ ] Uses only Fast or Tiny model tier
- [ ] Is stateless (no class-level mutable state)
- [ ] Returns structured WorkerResult
- [ ] Passes typecheck
- [ ] Passes its own tests

## QUALITY CHECKLIST PER COMPONENT

Before marking a component as complete:
- [ ] Typed props interface defined
- [ ] Handles loading state
- [ ] Handles empty/error state
- [ ] Uses Tailwind utility classes only (no custom CSS)
- [ ] No hardcoded data — reads from props or Zustand store
- [ ] Passes typecheck
- [ ] Builds without errors

---

## LAUNCH PROMPT

```
Read AGENTS.md completely. Then read GEMINI-ASSIGNMENT.md for your
specific phase assignments. Execute the phases listed in
GEMINI-ASSIGNMENT.md in the order specified, following the autonomous
loop in AGENTS.md Section 2.1. Work in the branches specified.
Commit after each individual worker template or dashboard component.
Continue until all assigned phases show PASS or are BLOCKED.
```
