# OPUS-ASSIGNMENT.md — Phases Assigned to Opus (Claude)

---

## YOUR ROLE

You are OPUS. You are the architect. You build the components
that require full system context, cross-cutting reasoning, and
enforcement of hard guarantees. You also perform integration
review of all work produced by CODEX and GEMINI.

**Read AGENTS.md first.** It is the operating manual you wrote.

---

## YOUR ASSIGNED PHASES (in order)

### Phase 0: Scaffold & Types — COMPLETE
Core schemas frozen. All agents import from `src/shared/types.ts`.

### Phase 1: Agent Factory
**Branch:** `agent/opus/factory`
**Priority:** CRITICAL — everything depends on this
**Full spec:** See AGENTS.md Phase 1
**Why you:** The Factory enforces the hard guarantees from the
Infinite Glitch spec. Privilege escalation prevention, budget
cascading, lineage immutability, and provenance hashing require
reasoning about combinatorial constraint interactions that lower-tier
models will get subtly wrong.

### Phase 3: Evaluation Engine (architecture + escalation logic)
**Branch:** `agent/opus/evaluation-engine`
**Priority:** CRITICAL — quality gate for entire system
**Full spec:** See AGENTS.md Phase 3
**Why you:** The escalation logic (when to retry vs escalate vs
HITL) requires judgment about failure modes. The staged pipeline
design (deterministic → LLM critic → Opus → HITL) is an
architectural decision with cascading cost and quality implications.
**Note:** CODEX builds the DeterministicEvaluator implementation.
You build the pipeline architecture, the LlmCriticEvaluator, the
EscalationEvaluator, and the orchestration logic.

### Phase 7: Jarvis Orchestrator
**Branch:** `agent/opus/jarvis`
**Priority:** HIGH — but intentionally late (needs Factory, Mechanic, Eval)
**Full spec:** See AGENTS.md Phase 7
**Why you:** Goal decomposition, task DAG construction, and the
clarification protocol require frontier-level reasoning. The system
prompt design and personality layer are nuanced prompt engineering
that directly determines system behavior.

### Phase 11: Integration
**Branch:** `main` (after all PRs merged)
**Priority:** FINAL
**Full spec:** See AGENTS.md Phase 11
**Why you:** Integration requires holding the full system in context
and reasoning about cross-component interactions. You review all
PRs from CODEX and GEMINI before merging.

---

## INTEGRATION REVIEW PROTOCOL

When CODEX or GEMINI complete a phase and submit for review:

1. **Check type compliance.** Do they import from `src/shared/types.ts`
   only? Any inline type definitions = reject.

2. **Check interface compliance.** Do implementations match the
   interfaces exactly? Any signature deviations = reject.

3. **Check security invariants.** No raw shell, no eval, no secrets
   in memory, no budget self-modification.

4. **Check test quality.** Error paths tested first? Edge cases covered?
   Deterministic? No network calls in unit tests?

5. **Check architectural boundaries.** Business logic in UI? Agents
   holding secrets? Workers spawning children? = reject.

6. **Run full typecheck + test suite** after merge.

If review fails: provide specific feedback in the PR, do not
merge, return to the owning agent for fixes.

---

## PARALLEL EXECUTION MAP

```
Week 1:
  OPUS  → Phase 1 (Factory)
  CODEX → Phase 2 (Governor) + Phase 5 (Dashboard Scaffold)
  GEMINI → Phase 8 (Worker Templates, first 4)

Week 2:
  OPUS  → Phase 3 (Eval Engine) + review CODEX Phase 2
  CODEX → Phase 4 (Mechanic) + review feedback fixes
  GEMINI → Phase 8 (Worker Templates, remaining 4) + Phase 10 starts

Week 3:
  OPUS  → Phase 7 (Jarvis) + review CODEX Phase 4
  CODEX → Phase 6 (Librarian) + Phase 9 (Tool Primitives)
  GEMINI → Phase 10 (Dashboard Components) + Phase 9 (partial)

Week 4:
  OPUS  → Phase 11 (Integration) — merge all, end-to-end test
  ALL   → Bug fixes, integration test failures, polish
```

---

## LAUNCH PROMPT (for yourself in future sessions)

```
Read AGENTS.md completely. Then read OPUS-ASSIGNMENT.md for your
specific phase assignments. You are the architect. Build Phase 1
(Agent Factory) first — it unblocks CODEX and GEMINI. Then proceed
to Phase 3, Phase 7, and Phase 11 in order. Between your own phases,
review PRs from CODEX and GEMINI using the Integration Review Protocol.
```
