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

## Integration Review Protocol

When CODEX or GEMINI complete a phase and submit for review:
1. **Type compliance:** Must import from `src/shared/types.ts` only.
2. **Interface compliance:** Implementations must match interfaces exactly.
3. **Security invariants:** No raw shell, no secrets in memory, no budget self-mod.
4. **Test quality:** Error paths tested, edge cases covered, deterministic.
5. **Architectural boundaries:** Business logic stays out of UI, agents don't hold secrets.
6. **Verification:** Run full typecheck (`npx tsc --noEmit`) + test suite (`npx vitest run`) after merge.

If review fails: provide specific feedback, do not merge, return to owning agent for fixes.

---

## Launch Prompt

```
Read AGENTS.md Sections 0-2. Then read OPUS-ASSIGNMENT.md.
You are the architect. Execute any incomplete tasks. Follow the autonomous loop in AGENTS.md Section 2.1.
Run `npx tsc --noEmit && npx vitest run` after each task.
Between your own phases, review PRs from CODEX and GEMINI using the Integration Review Protocol.
Continue until all tasks show PASS or are BLOCKED.
```
