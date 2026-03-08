# OPUS-ASSIGNMENT.md

## Role

You are OPUS. You are the architect. You build the components that require full system context, cross-cutting reasoning, and enforcement of hard guarantees. You also perform integration review of all work produced by CODEX and GEMINI.

Read AGENTS.md first — it is the operating manual you wrote.

**Rules:**
- Import types ONLY from `src/shared/types.ts`
- No `any`. No `@ts-ignore`. No `as any`.
- Commit after each task. Run `npx tsc --noEmit && npx vitest run` to verify.
- Always work in your assigned branch. Never push to main directly.
- If BLOCKED, output the BLOCKED format from AGENTS.md Section 8 and move on.

---

## Build Phases (Original — All PASS)

| # | Phase | Branch | Tests | Status |
|---|-------|--------|-------|--------|
| 0 | Scaffold & Types | `main` | 0 | ✅ PASS |
| 1 | Agent Factory | `agent/opus/factory` | 18 | ✅ PASS |
| 3 | Evaluation Engine | `agent/opus/evaluation-engine` | 17 | ✅ PASS |
| 7 | Jarvis Orchestrator | `agent/opus/jarvis` | 25 | ✅ PASS |
| 11 | Integration | `main` | 10 | ✅ PASS |

### Key constraints per phase

- **Phase 0 (Scaffold):** Core schemas frozen. All agents import from `src/shared/types.ts`.
- **Phase 1 (Factory):** Enforces hard guarantees (privilege escalation prevention, budget cascading, lineage immutability, provenance hashing).
- **Phase 3 (Eval Engine):** Staged pipeline design (Deterministic → LLM Critic → Hitl). Escalation logic requires judgment about failure modes.
- **Phase 7 (Jarvis):** Goal decomposition, task DAG construction, and clarification protocol require frontier-level reasoning.
- **Phase 11 (Integration):** 8 end-to-end flows. Reviews all PRs from CODEX and GEMINI before merging.

---

## Production Hardening Tasks

Branch: `prod-hardening`. All complete as of 2026-03-08.

| # | Task | Wave | Depends On | Status |
|---|------|------|------------|--------|
| T9 | LlmGoalAnalyzer | 3 | None | ✅ PASS |
| T10 | WorkerTaskExecutor | 3 | T9 | ✅ PASS |
| T16 | Smoke Tests | 3 | T10 | ✅ PASS |
| LW | Live LLM Wiring | 5 | All above | ✅ PASS |

### Files created/modified per task

**T9** — `src/orchestrator/LlmGoalAnalyzer.ts`. Injectable `LlmProvider`, zod validation of LLM JSON output, graceful fallback to single-node DAG on parse errors.
**T10** — `src/orchestrator/WorkerTaskExecutor.ts`. Routes DAG nodes to Workers by assigned role via `WorkerRegistry`, runs EvalPipeline, records budget via Governor.
**T16** — `src/server/smoke.test.ts`. 7 E2E tests for goal→DAG→execute lifecycle, agent CRUD, etc. (uses test container w/ stub providers).
**Live Wiring (LW)** — `src/orchestrator/AnthropicProvider.ts`, `src/workers/ResearchWorker.ts`, `src/index.ts`. Built fetch-based Anthropic API provider and first concrete worker. Modified main entry point to auto-detect `ANTHROPIC_API_KEY` to wire real `LlmGoalAnalyzer` + `WorkerTaskExecutor` + `ResearchWorker`, or fall back to stubs.

---

## Phase 2 — Control Plane Hardening + Memory Spine

Branch: `agent/opus/phase-2-control-plane`
Ref: AGENTS.md Sections 8-9, Appendices A-F

OPUS owns the Jarvis refactor (the critical architecture change), EvalPipeline + BudgetGovernor integrations, and Phase 2 integration tests. CODEX handles the bulk infrastructure. GEMINI handles minions, dashboard, and tool loading.

**OPUS role in Phase 2:** Architect, implement Jarvis handoff (requires frontier reasoning), integrate minion hooks into eval/governor, write integration tests, review CODEX/GEMINI work.

### Phase 2 Task Table

| # | Task | Wave | Phase | Depends On | Status |
|---|------|------|-------|------------|--------|
| P2-O1 | Refactor `IJarvis.ts` — add `createPlan`, remove execution ownership | 2 | 12 | P2-C1 (contracts) | ⬜ NOT_STARTED |
| P2-O2 | Refactor `Jarvis.ts` — PlanEnvelope handoff, no execution loop | 2 | 12 | P2-O1 | ⬜ NOT_STARTED |
| P2-O3 | Update `Jarvis.test.ts` — PlanEnvelope behavior, no execution | 2 | 12 | P2-O2 | ⬜ NOT_STARTED |
| P2-O4 | Modify `EvalPipeline.ts` — front-run with AuditMinion checks | 4 | 15 | P2-G2 (AuditMinion) | ⬜ NOT_STARTED |
| P2-O5 | Modify `BudgetGovernor.ts` — emit telemetry hooks | 4 | 15 | P2-G1 (TelemetryMinion) | ⬜ NOT_STARTED |
| P2-O6 | Integration test — Jarvis → Dispatcher → Worker → Eval flow | 8 | 12 | P2-C4, P2-O2 | ⬜ NOT_STARTED |
| P2-O7 | Integration test — memory proposal lifecycle | 8 | 13 | P2-C11, P2-C12 | ⬜ NOT_STARTED |
| P2-O8 | Integration test — checkpoint resume + Mechanic safety rejection | 8 | 14,16 | P2-C16, P2-C23 | ⬜ NOT_STARTED |

### Wave 2 — Jarvis Handoff Refactor (P2-O1 through P2-O3)

This is the critical architecture change of Phase 2. Jarvis must stop being the runtime babysitter and become a pure strategic planner.

**P2-O1: Refactor `src/orchestrator/IJarvis.ts`**
Add new method, deprecate old:
```typescript
// NEW — Jarvis creates a plan and hands off
createPlan(goal: string, tenantId: string): Promise<PlanEnvelope>

// DEPRECATED — execution ownership moves to Dispatcher
// Keep signature for backward compat during transition, but implementation
// should delegate to Dispatcher internally
executeDAG(dag: TaskDAG): Promise<ExecutionResult>
```
Update imports: add `PlanEnvelope`, `EscalationPolicy`, `RetrievalPolicy`, `Budget` from `@shared/types`.
The `PlanEnvelope` bundles: `taskDag`, `budgetEnvelope`, `escalationPolicy`, `retrievalPolicy`, `tenantId`.
Verify: `npx tsc --noEmit`

**P2-O2: Refactor `src/orchestrator/Jarvis.ts`**
This is the most architecturally sensitive change in Phase 2.

Current behavior: Jarvis owns `processGoal` → `executeDAG` → retry/escalation loop.
Target behavior: Jarvis owns `processGoal` → `createPlan` → hand `PlanEnvelope` to `IDispatcher` → sleep.

Changes:
1. Add `createPlan()` method:
   - Analyze goal (existing `completenessMatrix` logic stays)
   - Build `TaskDAG` (existing decomposition logic stays)
   - Compute budget envelope for the plan
   - Construct `EscalationPolicy` with sensible defaults
   - Construct `RetrievalPolicy` scoped to tenant
   - Return `PlanEnvelope`
2. Inject `IDispatcher` into Jarvis constructor
3. `processGoal` now calls `createPlan` → `dispatcher.accept(envelope)`
4. `executeDAG` becomes a thin delegate to `dispatcher.accept()`
5. Jarvis re-enters ONLY when Dispatcher escalates via `EscalationReason`
6. Add `handleEscalation(planId: string, reason: EscalationReason)` method

**Critical guardrails:**
- Do NOT break existing `processGoal` or `executeDAG` callers — preserve signatures
- Jarvis MUST NOT hold references to running execution state
- The `GoalAnalyzer` and completeness matrix logic stays in Jarvis — that is strategic reasoning
- Execution loops, retries, wait states — all move to Dispatcher

Verify: `npx tsc --noEmit`

**P2-O3: Update `src/orchestrator/Jarvis.test.ts`**
Update existing tests + add new ones for PlanEnvelope behavior:
- `processGoal` now returns after plan creation (no blocking execution)
- `createPlan` produces valid `PlanEnvelope` with all required fields
- `PlanEnvelope.budgetEnvelope` does not exceed agent's remaining budget
- `PlanEnvelope.escalationPolicy` has sensible defaults
- `executeDAG` delegates to Dispatcher (mock `IDispatcher`)
- Escalation re-entry only on typed reasons
- Clarification still fires when completeness < 70%

Preserve ALL existing passing tests. Update mocks as needed for new Dispatcher injection.
Min 6 new tests for PlanEnvelope-specific behavior.
Verify: `npx vitest run src/orchestrator/Jarvis.test.ts`

### Wave 4 — Eval + Governor Integration (P2-O4, P2-O5)

**P2-O4: Modify `src/eval/EvalPipeline.ts` — front-run with AuditMinion**
Insert `IAuditMinion.audit()` as a pre-check before `DeterministicEvaluator`:
- If audit verdict is `reject` → skip all eval stages, return `EvalResult` with `outcome: Fail`
- If audit verdict is `warn` → proceed with eval but include warnings in result
- If audit verdict is `pass` → proceed normally
- AuditMinion is injected, not imported directly. Pipeline works without it (graceful no-op).

Update existing tests. Min 3 new tests: audit reject short-circuits eval, audit warn passes through, audit absent (no-op).
Verify: `npx vitest run src/eval/`

**P2-O5: Modify `src/governor/BudgetGovernor.ts` — emit telemetry hooks**
After `recordUsage()`, emit a structured event that `TelemetryMinion` can subscribe to:
- Add optional `onUsageRecorded` callback (or event emitter pattern)
- `TelemetryMinion` hooks into this to track burn rates
- Does not change Governor's enforcement logic — purely observational addition

Update existing tests. Min 2 new tests: callback fires on usage, callback absent (no-op).
Verify: `npx vitest run src/governor/`

### Wave 8 — Phase 2 Integration Tests (P2-O6 through P2-O8)

**P2-O6: Integration test — Jarvis → Dispatcher → Worker → Eval flow**
Full end-to-end test of the new control plane:
1. Jarvis receives goal, creates `PlanEnvelope`
2. Dispatcher accepts envelope, schedules nodes
3. Worker executes task, returns result with `memoryProposals`
4. AuditMinion pre-screens output
5. EvalPipeline evaluates result
6. Dispatcher handles pass/fail/retry
7. Plan completes, Dispatcher state = `completed`

Min 4 tests: happy path, worker failure → Dispatcher retry, retry limit → escalation to Jarvis, budget trip during execution.
Verify: `npx vitest run src/integration/`

**P2-O7: Integration test — memory proposal lifecycle**
End-to-end test of the memory spine:
1. Worker emits `MemoryProposal` in result
2. `WorkerTaskExecutor` routes proposal to `Librarian.submitProposal`
3. `MemoryProposalPipeline` validates, extracts facts, dedupes
4. `KnowledgeEntryV2` created with tenant tag
5. `queryV2` with `RetrievalPolicy` returns tenant-scoped results
6. Cross-tenant query returns empty

Min 3 tests: proposal → stored knowledge, duplicate proposal rejection, tenant isolation.
Verify: `npx vitest run src/integration/`

**P2-O8: Integration test — checkpoint resume + Mechanic safety**
1. Dispatcher checkpoints mid-execution
2. Simulate restart, resume from checkpoint
3. Verify completed nodes are not re-executed
4. Verify failed nodes are retried
5. Mechanic receives unsafe action → rejects with structured error
6. Mechanic receives valid `MechanicRequest` → executes and audit logs

Min 4 tests: checkpoint save/resume, node skip on resume, unsafe Mechanic action rejection, valid Mechanic action with audit log.
Verify: `npx vitest run src/integration/`

### Key constraints for Phase 2

- **Jarvis thinks. Dispatcher runs.** This is the core architecture change.
- **Jarvis must NOT hold execution state.** PlanEnvelope is fire-and-forget.
- **Existing tests MUST keep passing.** Refactors preserve backward compat.
- **AuditMinion in EvalPipeline is optional** — pipeline works without it.
- **TelemetryMinion hooks are observational only** — no enforcement logic changes.
- **Integration tests cover cross-module boundaries** — not unit-level logic.

---

## Integration Review Protocol

When CODEX or GEMINI complete a Phase 2 task and submit for review:
1. **Type compliance:** Must import from `src/shared/types.ts` only.
2. **Interface compliance:** Implementations must match interfaces exactly.
3. **Security invariants:** No raw shell, no secrets in memory, no budget self-mod, no direct worker durable writes, tenant isolation in code.
4. **Test quality:** Error paths tested, edge cases covered, deterministic.
5. **Architectural boundaries:** Jarvis does not execute. Dispatcher does not reason. Workers do not write memory. Mechanic accepts whitelisted actions only.
6. **Phase 2 guardrails:** No critical stubs in success paths. No prompt-only tenancy. No unrestricted tool bundles.
7. **Verification:** Run full typecheck (`npx tsc --noEmit`) + test suite (`npx vitest run`) after merge.

If review fails: provide specific feedback, do not merge, return to owning agent for fixes.

---

## Launch Prompt

```
Read AGENTS.md Sections 1-9 and Appendices A-F. Then read OPUS-ASSIGNMENT.md.
You are the architect. Execute Phase 2 tasks in wave order (2 → 4 → 8).
Wave 2 depends on P2-C1 (contracts freeze by CODEX). If not ready, review AGENTS.md Phase 2 spec and prepare.
Wave 4 depends on P2-G1/G2 (minions by GEMINI). If not ready, skip to integration prep.
Wave 8 depends on CODEX completing infrastructure tasks. Run integration tests last.
Run `npx tsc --noEmit && npx vitest run` after each task.
Between your own tasks, review CODEX and GEMINI submissions using the Integration Review Protocol.
Commit: `[OPUS:component] Phase N: description`
Continue until all tasks show PASS or are BLOCKED.
```
