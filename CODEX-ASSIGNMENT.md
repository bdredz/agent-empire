# CODEX-ASSIGNMENT.md — Phases Assigned to Codex 5.2

---

## YOUR ROLE

You are CODEX. You build the infrastructure and enforcement layers.
Your work runs in parallel with OPUS (architect) and GEMINI (components).

**Read AGENTS.md first.** It contains your operating rules, the full
phase definitions, and the shared types you MUST import from.

---

## YOUR ASSIGNED PHASES (in order)

### Phase 2: Budget Governor
**Branch:** `agent/codex/budget-governor`
**Priority:** HIGHEST — nothing runs safely without this
**Full spec:** See AGENTS.md Phase 2
**Key constraint:** This is middleware, not an agent. Agents cannot
override their own budget. The Governor reads from persistent storage
and enforces limits at the infrastructure level.

### Phase 4: Mechanic Agent
**Branch:** `agent/codex/mechanic`
**Priority:** HIGH — Jarvis needs this to provision businesses
**Full spec:** See AGENTS.md Phase 4
**Key constraint:** ALL Docker operations via dockerode typed API.
NEVER use child_process. NEVER use exec. NEVER run arbitrary commands.
Mock dockerode in tests — do not require a running Docker daemon for
unit tests.

### Phase 5: Dashboard Scaffold
**Branch:** `agent/codex/dashboard`
**Priority:** MEDIUM — provides the visual control plane
**Full spec:** See AGENTS.md Phase 5
**Key constraint:** Next.js 14 app router. Zustand for state.
Dashboard is READ-ONLY for business data. Chat sends to API,
does not run LLM locally.

### Phase 6: Librarian Agent
**Branch:** `agent/codex/librarian`
**Priority:** MEDIUM — knowledge hygiene before scaling
**Full spec:** See AGENTS.md Phase 6
**Key constraint:** Uses pgvector for similarity search.
Dedup threshold and TTL are configurable via env vars.

### Phase 9 (partial): Tool Primitives — LeadTracker, ApiGateway, WebhookManager
**Branch:** `agent/codex/tool-primitives`
**Priority:** LOWER — needed before first business launch
**Full spec:** See AGENTS.md Phase 9
**Key constraint:** Each primitive is a self-contained module with
its own schema, MCP endpoints, and test file. Follow the pattern
established by whichever primitive is built first.

---

## PARALLEL EXECUTION RULES

You can run Phases 2 and 4 in parallel — they share no files
and both depend only on Phase 0 (types), which is already complete.

Phase 5 can also run in parallel with 2 and 4.

Phase 6 must wait until Phase 1 (Factory, built by OPUS) is merged.

Phase 9 must wait until Phase 4 (your own Mechanic) is complete.

---

## COORDINATION PROTOCOL

1. **Always work in your assigned branch.** Never push to main directly.
2. **Import types ONLY from `src/shared/types.ts`.** If a type is missing,
   create a PR to add it — do not define types inline.
3. **Commit after each completed step** within a phase, not just at phase end.
4. **If you hit a BLOCKED state,** output the BLOCKED message format from
   AGENTS.md Section 8 and move to your next assigned phase.
5. **When all your phases are PASS,** output the completion signal and stop.

---

## WHAT YOU DO NOT BUILD

- Agent Factory (OPUS)
- Evaluation Engine architecture (OPUS)
- Jarvis Orchestrator (OPUS)
- Worker Templates (GEMINI)
- Dashboard Components (GEMINI)
- Integration wiring (OPUS)

Do not touch files owned by other agents. If you need an interface
that another agent hasn't built yet, code against the interface
definition in the types file and mock it in your tests.

---

## LAUNCH PROMPT

```
Read AGENTS.md completely. Then read CODEX-ASSIGNMENT.md for your
specific phase assignments. Execute the phases listed in
CODEX-ASSIGNMENT.md in the order specified, following the autonomous
loop defined in AGENTS.md Section 2.1. Work in the branches specified.
Do not stop between phases. Continue until all your assigned phases
show PASS or are BLOCKED.
```
