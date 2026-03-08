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

## Phase 2 — Control Plane Hardening + Memory Spine

Branch: `agent/codex/phase-2-hardening`
Ref: AGENTS.md Sections 8-9, Appendices A-F

CODEX owns the bulk of Phase 2 infrastructure. You build the Dispatcher, memory spine, checkpointing, Mechanic safety, and capability manifests. OPUS handles the Jarvis refactor and integration tests. GEMINI handles minions, dashboard updates, and dynamic tool loading.

### Phase 2 Task Table

| # | Task | Wave | Phase | Depends On | Status |
|---|------|------|-------|------------|--------|
| P2-C1 | Freeze Phase 2 contracts in `src/shared/types.ts` | 1 | 12 | None | ⬜ NOT_STARTED |
| P2-C2 | Create `src/orchestrator/IDispatcher.ts` | 2 | 12 | P2-C1 | ⬜ NOT_STARTED |
| P2-C3 | Create `src/orchestrator/runtimeState.ts` | 2 | 12 | P2-C1 | ⬜ NOT_STARTED |
| P2-C4 | Create `src/orchestrator/DispatcherMinion.ts` + tests | 2 | 12 | P2-C2, P2-C3, P2-O1 | ⬜ NOT_STARTED |
| P2-C5 | Wire Dispatcher into `src/server/container.ts` | 2 | 12 | P2-C4 | ⬜ NOT_STARTED |
| P2-C6 | Create `src/librarian/memoryTypes.ts` | 3 | 13 | P2-C1 | ⬜ NOT_STARTED |
| P2-C7 | Create `src/librarian/MemoryPolicy.ts` | 3 | 13 | P2-C6 | ⬜ NOT_STARTED |
| P2-C8 | Create `src/librarian/AtomicFactExtractor.ts` + tests | 3 | 13 | P2-C6 | ⬜ NOT_STARTED |
| P2-C9 | Create `src/librarian/RetrievalPolicyEnforcer.ts` + tests | 3 | 13 | P2-C6, P2-C7 | ⬜ NOT_STARTED |
| P2-C10 | Create `src/librarian/MemoryProposalPipeline.ts` + tests | 3 | 13 | P2-C7, P2-C8 | ⬜ NOT_STARTED |
| P2-C11 | Modify `src/librarian/ILibrarian.ts` + `Librarian.ts` for V2 | 3 | 13 | P2-C9, P2-C10 | ⬜ NOT_STARTED |
| P2-C12 | Modify `src/workers/IWorker.ts` — emit proposals, block direct writes | 3 | 13 | P2-C10 | ⬜ NOT_STARTED |
| P2-C13 | Create `src/runtime/checkpoints/ICheckpointStore.ts` | 5 | 14 | P2-C5 | ⬜ NOT_STARTED |
| P2-C14 | Create `src/runtime/checkpoints/PostgresCheckpointStore.ts` + tests | 5 | 14 | P2-C13 | ⬜ NOT_STARTED |
| P2-C15 | Create `src/runtime/checkpoints/RedisCheckpointStore.ts` + tests | 5 | 14 | P2-C13 | ⬜ NOT_STARTED |
| P2-C16 | Create `src/runtime/checkpoints/WorkflowResumer.ts` + tests | 5 | 14 | P2-C14 | ⬜ NOT_STARTED |
| P2-C17 | Create `src/runtime/scheduler/WaitConditionScheduler.ts` + tests | 5 | 14 | P2-C13 | ⬜ NOT_STARTED |
| P2-C18 | Modify `WorkerTaskExecutor.ts` — checkpoint integration | 5 | 14 | P2-C16, P2-C17 | ⬜ NOT_STARTED |
| P2-C19 | Update `src/shared/config.ts` — checkpoint/wait config | 5 | 14 | P2-C13 | ⬜ NOT_STARTED |
| P2-C20 | Create `src/mechanic/ActionPolicy.ts` | 6 | 16 | P2-C1 | ⬜ NOT_STARTED |
| P2-C21 | Create `src/mechanic/MechanicRequestValidator.ts` + tests | 6 | 16 | P2-C20 | ⬜ NOT_STARTED |
| P2-C22 | Create `src/mechanic/MechanicAuditLog.ts` + tests | 6 | 16 | P2-C20 | ⬜ NOT_STARTED |
| P2-C23 | Modify Mechanic + provisioners — accept `MechanicRequest` only | 6 | 16 | P2-C21, P2-C22 | ⬜ NOT_STARTED |
| P2-C24 | Create `src/librarian/CapabilityManifestWriter.ts` + tests | 8 | 18 | P2-C11 | ⬜ NOT_STARTED |
| P2-C25 | Create `src/librarian/InternalRegistry.ts` + tests | 8 | 18 | P2-C24 | ⬜ NOT_STARTED |
| P2-C26 | Modify `src/mechanic/Mechanic.ts` — emit manifests on deploy | 8 | 18 | P2-C23, P2-C24 | ⬜ NOT_STARTED |

### Wave 1 — Contract Freeze (P2-C1)

**P2-C1: Freeze Phase 2 shared contracts in `src/shared/types.ts`**
Add ALL contracts from AGENTS.md Appendix B (Sections B.1–B.5) to `src/shared/types.ts`:
- B.1 Control-plane: `ExecutionStatus`, `EscalationPolicy`, `EscalationReason`, `PlanEnvelope`, `DispatcherState`
- B.2 Memory-spine: `MemoryKind`, `MemoryProposal`, `KnowledgeEntryV2`, `RetrievalPolicy`
- B.3 Durability: `WorkflowCheckpoint`, `WaitCondition`
- B.4 Mechanic safety: `MechanicAction`, `MechanicRequest`
- B.5 Capability manifests: `CapabilityManifest`

Copy the exact type definitions from Appendix B. Do not deviate. Use branded types where IDs exist.
Verify: `npx tsc --noEmit`

### Wave 2 — Dispatcher Infrastructure (P2-C2 through P2-C5)

**P2-C2: Create `src/orchestrator/IDispatcher.ts`**
Interface for the runtime controller:
```typescript
interface IDispatcher {
  accept(envelope: PlanEnvelope): Promise<void>
  getState(planId: string): DispatcherState
  pause(planId: string): void
  resume(planId: string): void
  escalate(planId: string, reason: EscalationReason): Promise<void>
}
```
Dispatcher is NOT a strategic planner. It is a deterministic runtime controller.

**P2-C3: Create `src/orchestrator/runtimeState.ts`**
Helpers for `DispatcherState` management: state transitions, node readiness checks, retry tracking. Pure functions, no side effects. Import `ExecutionStatus`, `DispatcherState`, `EscalationReason` from `@shared/types`.

**P2-C4: Create `src/orchestrator/DispatcherMinion.ts` + tests**
Implements `IDispatcher`. Owns the execution loop that Jarvis currently runs:
- Accepts `PlanEnvelope` from Jarvis
- Schedules ready DAG nodes via `WorkerTaskExecutor`
- Manages retries up to `escalationPolicy.maxRetriesPerNode`
- Tracks wait states and hibernation
- Escalates to Jarvis only on typed `EscalationReason` triggers
- Checkpoint-ready: every state transition is serializable

Inject: `WorkerTaskExecutor`, `IBudgetGovernor`, `EvalPipeline`, `ICheckpointStore` (optional initially).
Min 12 tests: accept plan, schedule node, retry on failure, escalate on retry limit, budget trip escalation, pause/resume, concurrent node execution, dependency ordering, wait state handling, state serialization, escalation reason typing, completed plan detection.
Verify: `npx vitest run src/orchestrator/DispatcherMinion.test.ts`

**P2-C5: Wire Dispatcher into `src/server/container.ts`**
Register `DispatcherMinion` in DI container. Jarvis should resolve `IDispatcher` for plan handoff.
Verify: `npx tsc --noEmit && npx vitest run`

### Wave 3 — Memory Spine & Tenancy (P2-C6 through P2-C12)

**P2-C6: Create `src/librarian/memoryTypes.ts`**
Re-export `MemoryKind`, `MemoryProposal`, `KnowledgeEntryV2`, `RetrievalPolicy` from `@shared/types`. Add local helpers: `isPromotion(proposal)`, `isSupersession(entry)`, default policy factory.

**P2-C7: Create `src/librarian/MemoryPolicy.ts`**
Write-gate policy enforcement:
- Validates `MemoryProposal` fields (required tenantId, kind, content)
- Rejects proposals from agents not in allowed-writers list
- Enforces max raw content length
- Rejects sensitive content patterns (secrets, PII markers)
- Returns structured accept/reject result

**P2-C8: Create `src/librarian/AtomicFactExtractor.ts` + tests**
Breaks raw content into atomic facts (individual claims, not paragraphs):
- Split on sentence boundaries
- Deduplicate near-identical facts
- Score confidence per fact
- Return `string[]` of atomic facts
Min 6 tests: empty input, single fact, multi-fact extraction, dedup, confidence scoring, max-facts limit.
Verify: `npx vitest run src/librarian/AtomicFactExtractor.test.ts`

**P2-C9: Create `src/librarian/RetrievalPolicyEnforcer.ts` + tests**
Enforces `RetrievalPolicy` at query time:
- Filter by `tenantId` (mandatory)
- Filter by `businessUnitId` (optional, narrows scope)
- Include/exclude global architecture knowledge
- Filter by `allowedKinds`
- Enforce `maxFacts` and `maxTokens` limits
- Never return cross-tenant results
Min 8 tests: tenant isolation (CRITICAL), business unit scoping, global inclusion/exclusion, kind filtering, fact limit, token limit, empty results, reject missing tenantId.
Verify: `npx vitest run src/librarian/RetrievalPolicyEnforcer.test.ts`

**P2-C10: Create `src/librarian/MemoryProposalPipeline.ts` + tests**
Orchestrates the full write path:
1. Validate via `MemoryPolicy`
2. Extract atomic facts via `AtomicFactExtractor`
3. Dedup against existing entries
4. Score trust and freshness
5. Create `KnowledgeEntryV2` or reject
6. Handle supersession (mark old entry as superseded)
Inject: `MemoryPolicy`, `AtomicFactExtractor`, `ILibrarianStore`.
Min 10 tests: full pipeline happy path, policy rejection, dedup detection, supersession, trust scoring, freshness decay, tenant tagging, kind preservation, empty proposal, concurrent proposals.
Verify: `npx vitest run src/librarian/MemoryProposalPipeline.test.ts`

**P2-C11: Modify `src/librarian/ILibrarian.ts` + `Librarian.ts` for V2**
Add new methods alongside existing ones (preserve backward compat):
- `submitProposal(proposal: MemoryProposal): Promise<{ accepted: boolean; entryId?: string; reason?: string }>`
- `queryV2(query: string, policy: RetrievalPolicy): Promise<KnowledgeEntryV2[]>`
- Existing `ingest`, `query`, `prune`, `resolveConflict` remain but are marked for deprecation.
Update existing tests to cover V2 paths. Min 6 new tests.
Verify: `npx vitest run src/librarian/`

**P2-C12: Modify `src/workers/IWorker.ts` — emit proposals, block direct writes**
Add `memoryProposals?: MemoryProposal[]` to `WorkerResult`. Workers emit proposals in their results. `WorkerTaskExecutor` routes proposals to `Librarian.submitProposal`. Workers CANNOT call Librarian directly.
Update existing worker tests to verify proposals field is present.
Verify: `npx vitest run src/workers/`

### Wave 5 — Durability & Checkpointing (P2-C13 through P2-C19)

**P2-C13: Create `src/runtime/checkpoints/ICheckpointStore.ts`**
Interface for checkpoint persistence:
```typescript
interface ICheckpointStore {
  save(checkpoint: WorkflowCheckpoint): Promise<void>
  load(planId: string): Promise<WorkflowCheckpoint | null>
  list(tenantId: string): Promise<WorkflowCheckpoint[]>
  delete(checkpointId: string): Promise<void>
}
```

**P2-C14: Create `src/runtime/checkpoints/PostgresCheckpointStore.ts` + tests**
Implements `ICheckpointStore` using drizzle-orm. Stores checkpoints in `workflow_checkpoints` table. Serializes `DispatcherState` and node states as JSONB.
Min 8 tests: save, load, list, delete, overwrite, not-found, tenant isolation, concurrent writes.
Verify: `npx vitest run src/runtime/checkpoints/PostgresCheckpointStore.test.ts`

**P2-C15: Create `src/runtime/checkpoints/RedisCheckpointStore.ts` + tests**
Implements `ICheckpointStore` using ioredis. Fast cache layer for active workflows. TTL-based expiry.
Min 6 tests: save, load, TTL expiry, delete, not-found, serialization roundtrip.
Verify: `npx vitest run src/runtime/checkpoints/RedisCheckpointStore.test.ts`

**P2-C16: Create `src/runtime/checkpoints/WorkflowResumer.ts` + tests**
Loads checkpoint, reconstructs `DispatcherState`, and resumes execution from last known state:
- Load checkpoint from store
- Validate state consistency
- Reconstruct ready-node list
- Hand back to Dispatcher
- Handle corrupt checkpoint (escalate, don't crash)
Min 8 tests: resume from clean checkpoint, skip completed nodes, re-queue failed nodes, handle missing checkpoint, handle corrupt state, resume after hibernation, resume with wait conditions, tenant isolation.
Verify: `npx vitest run src/runtime/checkpoints/WorkflowResumer.test.ts`

**P2-C17: Create `src/runtime/scheduler/WaitConditionScheduler.ts` + tests**
Manages `WaitCondition` lifecycle:
- Register wait (time_delay, external_event, rate_limit, infra_outage)
- Check if conditions are met
- Integrate with Dispatcher to unblock waiting nodes
- Persist wait conditions via checkpoint store
Min 6 tests: time-based wait, external event resolution, rate limit wait, infra outage hibernation, condition expiry, concurrent waits.
Verify: `npx vitest run src/runtime/scheduler/WaitConditionScheduler.test.ts`

**P2-C18: Modify `WorkerTaskExecutor.ts` — checkpoint integration**
After each node execution, emit a checkpoint via `ICheckpointStore.save()`. On failure, save state before retry/escalation. Inject `ICheckpointStore` (optional — graceful no-op if absent).
Update existing tests. Min 4 new tests for checkpoint behavior.
Verify: `npx vitest run src/orchestrator/`

**P2-C19: Update `src/shared/config.ts` — checkpoint/wait config**
Add fields: `checkpointStoreType: 'postgres' | 'redis' | 'none'`, `checkpointTtlMs`, `waitConditionPollIntervalMs`. Map from env vars with sensible defaults.
Verify: `npx tsc --noEmit`

### Wave 6 — Mechanic Safety Hardening (P2-C20 through P2-C23)

**P2-C20: Create `src/mechanic/ActionPolicy.ts`**
Defines the whitelist of allowed `MechanicAction` values and validation rules per action:
- Each action type has required payload fields
- No free-form string commands accepted
- Validation returns structured accept/reject result
- Policy is static, not agent-configurable

**P2-C21: Create `src/mechanic/MechanicRequestValidator.ts` + tests**
Validates incoming `MechanicRequest` against `ActionPolicy`:
- Check action is whitelisted
- Validate payload schema per action type (Zod)
- Verify `approvedByPlanId` exists
- Verify `requestedByAgentId` has permission
- Reject unsafe/ambiguous requests with structured error
Min 8 tests: valid request, unknown action rejection, missing payload fields, invalid plan ID, unauthorized agent, SQL injection attempt in payload, empty payload, duplicate request detection.
Verify: `npx vitest run src/mechanic/MechanicRequestValidator.test.ts`

**P2-C22: Create `src/mechanic/MechanicAuditLog.ts` + tests**
Structured audit logging for all Mechanic actions:
- Log every request (accepted and rejected)
- Log execution result
- Log escalation events
- Use pino logger, structured JSON format
- Emit `SystemEvent` for critical actions
Min 4 tests: log accepted action, log rejected action, log execution result, log escalation.
Verify: `npx vitest run src/mechanic/MechanicAuditLog.test.ts`

**P2-C23: Modify Mechanic + provisioners — accept `MechanicRequest` only**
Refactor `src/mechanic/IMechanic.ts`, `Mechanic.ts`, `DockerProvisioner.ts`, `DatabaseProvisioner.ts`:
- All public methods accept `MechanicRequest` instead of raw parameters
- Route through `MechanicRequestValidator` before execution
- Audit-log every action via `MechanicAuditLog`
- Unsafe requests return structured error, do not execute
- Update ALL existing Mechanic tests for new `MechanicRequest` interface
Verify: `npx vitest run src/mechanic/`

### Wave 8 — Capability Manifests (P2-C24 through P2-C26)

**P2-C24: Create `src/librarian/CapabilityManifestWriter.ts` + tests**
Writes `CapabilityManifest` records into Librarian store:
- Validates manifest structure
- Stores as `MemoryKind: "capability_manifest"`
- Tenant-tagged and version-tracked
- Handles manifest updates (supersession)
Min 6 tests: write manifest, update manifest, invalid manifest rejection, tenant tagging, version tracking, supersession.
Verify: `npx vitest run src/librarian/CapabilityManifestWriter.test.ts`

**P2-C25: Create `src/librarian/InternalRegistry.ts` + tests**
Queryable registry of deployed capabilities:
- Search manifests by service name, operation, tenant
- Return structured manifest results
- Backed by Librarian V2 query interface
Min 6 tests: search by name, search by operation, tenant scoping, empty results, multiple matches, stale manifest filtering.
Verify: `npx vitest run src/librarian/InternalRegistry.test.ts`

**P2-C26: Modify `src/mechanic/Mechanic.ts` — emit manifests on deploy**
After successful business unit deployment, emit a `CapabilityManifest` via `CapabilityManifestWriter`. Include service name, base URL, health check URL, supported operations.
Min 2 new tests for manifest emission.
Verify: `npx vitest run src/mechanic/`

### Key constraints for Phase 2

- **Dispatcher is NOT a planner.** It is a cheap, deterministic runtime controller. No LLM calls.
- **Workers NEVER write durable memory directly.** They emit `MemoryProposal` in their results.
- **Tenant isolation is enforced in code**, not only in prompts. Every query must include `tenantId`.
- **Mechanic accepts ONLY whitelisted structured actions.** No raw strings, no free-form commands.
- **Checkpoints are infrastructure-level.** Do not bury them inside Jarvis.
- **Existing tests must keep passing.** Refactors must preserve backward compat or update tests.

---

## What You Do NOT Build

- Jarvis refactor / PlanEnvelope handoff (OPUS)
- EvalPipeline front-run modifications (OPUS)
- BudgetGovernor telemetry hooks (OPUS)
- Telemetry/Audit Minions (GEMINI)
- Dashboard component updates (GEMINI)
- Dynamic Tool Loading — ToolDiscoveryService, DomainToolRegistry (GEMINI)
- Phase 2 integration tests (OPUS)

Do not touch files owned by other agents. Mock missing interfaces in tests.

---

## Launch Prompt

```
Read AGENTS.md Sections 1-9 and Appendices A-F. Then read CODEX-ASSIGNMENT.md.
Execute Phase 2 tasks in wave order (1 → 2 → 3 → 5 → 6 → 8).
Wave 2 tasks P2-C4/C5 depend on OPUS completing P2-O1 (Jarvis refactor). If not ready, skip to Wave 3.
Run `npx tsc --noEmit && npx vitest run` after each task.
Commit: `[CODEX:component] Phase N: description`
Continue until all tasks show PASS or are BLOCKED.
```
