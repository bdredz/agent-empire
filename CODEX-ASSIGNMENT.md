# CODEX-ASSIGNMENT.md

## Role

You are CODEX. You build infrastructure, enforcement layers, and DevOps.
Read AGENTS.md first — it has your operating rules and shared types.

**Rules:**
- Import types ONLY from `src/shared/types.ts`
- Import logger from `src/shared/logger.ts`
- Import config from `src/shared/config.ts`
- No `any`. No `@ts-ignore`. No `as any`.
- Commit after each task. Run `npx tsc --noEmit && npx vitest run` to verify.
- Always work in your assigned branch. Never push to main directly.
- If BLOCKED, output the BLOCKED format from AGENTS.md Section 8 and move on.

---

## Build Phases (Original — All PASS)

Branch per phase. All complete as of 2026-03-04.

| # | Phase | Branch | Tests | Status |
|---|-------|--------|-------|--------|
| 2 | Budget Governor | `agent/codex/budget-governor` | 13 | ✅ PASS |
| 4 | Mechanic Agent | `agent/codex/mechanic` | 14 | ✅ PASS |
| 5 | Dashboard Scaffold | `agent/codex/dashboard` | 0 (scaffold) | ✅ PASS |
| 6 | Librarian Agent | `agent/codex/librarian` | 10 | ✅ PASS |
| 9 | Tool Primitives (LeadTracker, ApiGateway, WebhookManager) | `agent/codex/tool-primitives` | 28 | ✅ PASS |

### Key constraints per phase

- **Phase 2 (Governor):** Middleware, not an agent. Agents cannot override their own budget. File-backed persistent state.
- **Phase 4 (Mechanic):** ALL Docker via dockerode typed API. NEVER `child_process`/`exec`. Mock dockerode in tests.
- **Phase 5 (Dashboard):** Next.js 14 app router. Zustand state. READ-ONLY for business data.
- **Phase 6 (Librarian):** pgvector for similarity. Dedup threshold + TTL configurable via env.
- **Phase 9 (Primitives):** Each primitive is self-contained: schema + MCP endpoints + test file.

---

## Production Hardening Tasks

Branch: `prod-hardening`. All complete as of 2026-03-08.

| # | Task | Wave | Depends On | Status |
|---|------|------|------------|--------|
| T1 | Build System (`tsconfig.build.json` + scripts) | 1 | None | ✅ PASS |
| T8 | ESLint Config (`eslint.config.mjs`) | 2 | T1 | ✅ PASS |
| T12 | Health + Metrics Endpoints | 3 | T6 (OPUS) | ✅ PASS |
| T13 | Docker + Compose | 4 | T6 (OPUS) | ✅ PASS |
| T14 | CI/CD Pipeline (`.github/workflows/ci.yml`) | 4 | T6 (OPUS) | ✅ PASS |

### Files created/modified per task

**T1** — `tsconfig.build.json` (new), `package.json` (scripts)
**T8** — `eslint.config.mjs` (new), `package.json` (devDeps: `@typescript-eslint/parser`)
**T12** — `src/server/routes.ts` (enhanced `/health`, added `/metrics`)
**T13** — `Dockerfile` (multi-stage), `docker-compose.yml` (postgres+redis), `.dockerignore`
**T14** — `.github/workflows/ci.yml` (typecheck → test → lint → build)

---

## What You Do NOT Build

- Agent Factory, Evaluation Engine, Jarvis Orchestrator (OPUS)
- Worker Templates, Dashboard Components (GEMINI)
- Integration wiring (OPUS)

Do not touch files owned by other agents. Mock missing interfaces in tests.

---

## Launch Prompt

```
Read AGENTS.md Sections 0-2. Then read CODEX-ASSIGNMENT.md.
Execute any incomplete tasks. Follow the autonomous loop in AGENTS.md Section 2.1.
Run `npx tsc --noEmit && npx vitest run` after each task.
Continue until all tasks show PASS or are BLOCKED.
```
