# CLAUDE.md — OPUS Session Protocol

## Session Startup (MANDATORY — every session)

1. Read `MEMORY.md` — constructor signatures, gotchas, session state
2. Read `AGENTS.md` Sections 1-5 — project rules, stack, invariants
3. Read `CHANGELOG.md` last 3 entries — current build state
4. Read `src/shared/types.ts` only via Grep for the specific type you need — never read the whole 500-line file

Do NOT read OPUS-ASSIGNMENT.md or PRODUCTION-PLAN files — those are archived.

---

## Agent Hierarchy

| Agent | Model | Role | When to use |
|-------|-------|------|-------------|
| **OPUS** | Opus | Lead architect, planner, orchestrator | Planning, reviews, DI wiring decisions, complex debugging. **OPUS does NOT implement unless user explicitly instructs.** |
| **Sonnet** | Sonnet 4.6 | Implementation subagent | Multi-file features, server code, test suites, complex logic. Dispatch via `Agent` tool with `model: "sonnet"`. |
| **Haiku** | Haiku 3.5 | Deterministic small tasks | Single-file creates, config files, mechanical edits, schema updates. Dispatch via `Agent` tool with `model: "haiku"`. |
| **Codex** | Codex | Infra & mechanical | Build tooling, Docker, CI/CD, linting. User launches externally. |
| **Gemini** | Gemini | Frontend & docs | Dashboard, README, docs. User launches externally. |

### Dispatch Rules

- **Haiku first**: If task is single-file, deterministic, < 100 lines — use Haiku
- **Haiku parallel**: When 2+ Haiku tasks are independent, dispatch ALL in one message block
- **Sonnet for complexity**: Multi-file, needs type reasoning, tests + impl together
- **OPUS stays clean**: Plan the work, dispatch subagents, verify results. Never burn OPUS context on mechanical implementation
- **Guardrail subagents**: Every subagent prompt must include:
  - Exact file paths to create/modify
  - Exact interfaces/types (copy relevant signatures, don't say "check the file")
  - Verification command: `npx tsc --noEmit` and/or `npx vitest run`
  - Commit message with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

---

## Token Efficiency Rules

### Reading Code
- **Use Grep** to find specific interfaces, functions, types — never Read entire files to "explore"
- **Use Grep with `context: N`** to get surrounding lines — cheaper than reading whole files
- **Read with offset/limit** when you need a specific section of a large file
- **Glob for file discovery**, not `ls` or `find`
- **Cache type signatures** in your working memory — don't re-read types.ts every time

### Subagent Prompts
- Include ALL needed type signatures inline in the prompt — subagents can't read your context
- Specify exact file paths, never "find the right file"
- One clear deliverable per subagent — don't overload
- For Haiku: give the EXACT file content to write, no ambiguity

### Context Management
- Don't re-read files you've already read in this session unless modified
- Summarize findings before dispatching — don't pass raw file contents
- When verifying, use `tail -5` on test output, not full output
- Chain commands with `&&` to reduce round-trips

---

## Session Hygiene

### During Session
- Update `MEMORY.md` after completing any significant work (new interfaces, gotchas, wiring changes)
- Update `CHANGELOG.md` after each logical commit group
- Keep todo list current — mark completed immediately, remove stale items

### End of Session
- Ensure MEMORY.md reflects current state
- Ensure CHANGELOG.md has entries for all new commits
- Push to remote if user requests

---

## Project Conventions

### Source of Truth
- `src/shared/types.ts` — ALL shared types. Never define inline.
- `AGENTS.md` — project rules, architecture invariants
- `MEMORY.md` — constructor signatures, runtime gotchas, cross-session state
- `CHANGELOG.md` — build log with phase/task tracking

### Code Standards
- TypeScript strict mode — zero `any`, zero `@ts-ignore`
- Path aliases: `@shared/*`, `@factory/*`, `@eval/*`, `@orchestrator/*`, `@governor/*`, `@mechanic/*`, `@workers/*`, `@primitives/*`, `@librarian/*`
- Branded types for IDs: `AgentId`, `TaskId`, `RunId`, `ArtifactId`, `BusinessId`
- Const objects for enums: `AgentRole.Worker`, `EvalOutcome.Pass`, `TaskPriority.Normal`
- Dependency injection for all evaluators, providers, provisioners
- Tests alongside source: `Foo.test.ts` next to `Foo.ts`

### Build & Verify
```bash
npx tsc --noEmit          # typecheck
npx vitest run            # tests (216 passing, 24 files)
npm run lint              # eslint
npm run build             # production build
```

### Branch
- Active branch: `prod-hardening`
- All work on this branch unless user specifies otherwise

---

## Current State (2026-03-08)

- **All 11 build phases**: PASS (180 base tests)
- **Production hardening (T1-T16)**: ALL COMPLETE
- **Live LLM wiring**: Done — auto-detects `ANTHROPIC_API_KEY` at boot
- **Total tests**: 216/216 passing, 24 test files
- **Typecheck**: PASS (0 errors)
- **Key components**: Hono API server, DI container, rate limiter, Docker, CI/CD, real GoalAnalyzer + TaskExecutor + ResearchWorker
