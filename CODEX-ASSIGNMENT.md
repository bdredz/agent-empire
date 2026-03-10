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

## Phase 3 — Trusted External Operations: Trust, Evidence, and Commerce

Branch: `agent/codex/phase-3-trust-commerce`
Ref: `phase-3-master-blueprint-agent-empire.md` Sections 7–9, 13–14

**IMPORTANT — Branch Discipline:**
- Work ONLY in branch `agent/codex/phase-3-trust-commerce`
- Push to `main` ONLY when a task is complete and verified (`npx tsc --noEmit && npx vitest run` both PASS)
- Never push partial or failing work to `main`
- If you need interfaces from GEMINI or OPUS that are not yet on `main`, mock them in tests and mark the task as BLOCKED on that dependency

CODEX owns the majority of Phase 3: contract freeze, Trust Plane, Commerce Plane core + adapters, Wallet & Treasury, and Gateway Hardening. GEMINI builds the Evidence Plane, Discovery Plane, dashboard updates, and Hive Mind V2 namespaces. OPUS handles DI wiring, integration tests, and controlled chaos protocol.

### Phase 3 Task Table

| # | Task | Wave | Seq | Depends On | Status |
|---|------|------|-----|------------|--------|
| P3-C1 | Freeze Phase 3 contracts in `src/shared/types.ts` | 1 | 1 | None | ✅ PASS |
| P3-C2 | Create `src/trust/IAgentIdentityService.ts` | 2 | 2 | P3-C1 | ✅ PASS |
| P3-C3 | Create `src/trust/AgentIdentityService.ts` + tests | 2 | 2 | P3-C2 | ✅ PASS |
| P3-C4 | Create `src/trust/IMandateService.ts` | 2 | 2 | P3-C1 | ✅ PASS |
| P3-C5 | Create `src/trust/MandateService.ts` + tests | 2 | 2 | P3-C4 | ✅ PASS |
| P3-C6 | Create `src/trust/VerificationPolicyEngine.ts` + tests | 2 | 2 | P3-C2, P3-C4 | ✅ PASS |
| P3-C7 | Create `src/trust/CounterpartyRegistry.ts` + tests | 2 | 2 | P3-C1 | ✅ PASS |
| P3-C8 | Create `src/trust/AgentReputationService.ts` + tests | 2 | 2 | P3-C3, P3-C7 | ✅ PASS |
| P3-C9 | Create `src/trust/TrustAuditLog.ts` + tests | 2 | 2 | P3-C1 | ✅ PASS |
| P3-C10 | Create `src/trust/RevocationService.ts` + tests | 2 | 2 | P3-C3, P3-C5, P3-C9 | ✅ PASS |
| P3-C11 | Create `src/commerce/ICommerceOrchestrator.ts` + `ICommerceRailAdapter.ts` | 4 | 4 | P3-C1 | ✅ PASS |
| P3-C12 | Create `src/commerce/QuoteService.ts` + tests | 4 | 4 | P3-C11 | ⬜ NOT_STARTED |
| P3-C13 | Create `src/commerce/ReceiptService.ts` + tests | 4 | 4 | P3-C11 | ⬜ NOT_STARTED |
| P3-C14 | Create `src/commerce/DisputeService.ts` + tests | 4 | 4 | P3-C13 | ⬜ NOT_STARTED |
| P3-C15 | Create `src/commerce/RefundPolicyEngine.ts` + tests | 4 | 4 | P3-C13 | ⬜ NOT_STARTED |
| P3-C16 | Create `src/commerce/SettlementReconciler.ts` + tests | 4 | 4 | P3-C13 | ⬜ NOT_STARTED |
| P3-C17 | Create `src/commerce/CommerceOrchestrator.ts` + tests | 4 | 4 | P3-C12, P3-C13, P3-C14, P3-C15, P3-C16 | ⬜ NOT_STARTED |
| P3-C18 | Create `src/commerce/adapters/StripeCommerceAdapter.ts` + tests | 5 | 5 | P3-C11 | ⬜ NOT_STARTED |
| P3-C19 | Create `src/commerce/adapters/X402Adapter.ts` + tests | 5 | 5 | P3-C11 | ⬜ NOT_STARTED |
| P3-C20 | Create `src/commerce/adapters/CoinbaseWalletAdapter.ts` + tests | 5 | 5 | P3-C11 | ⬜ NOT_STARTED |
| P3-C21 | Create `src/commerce/adapters/McpPayAdapter.ts` + tests | 5 | 5 | P3-C11 | ⬜ NOT_STARTED |
| P3-C22 | Create `src/commerce/adapters/AP2MandateAdapter.ts` + tests | 5 | 5 | P3-C11, P3-C5 | ⬜ NOT_STARTED |
| P3-C23 | Create `src/commerce/wallets/WalletPolicyEngine.ts` + tests | 6 | 6 | P3-C1, P3-C5 | ⬜ NOT_STARTED |
| P3-C24 | Create `src/commerce/wallets/WalletBindingService.ts` + tests | 6 | 6 | P3-C23, P3-C3 | ⬜ NOT_STARTED |
| P3-C25 | Create `src/commerce/treasury/TreasuryService.ts` + tests | 6 | 6 | P3-C23, P3-C17 | ⬜ NOT_STARTED |
| P3-C26 | Create `src/commerce/treasury/TreasuryLedger.ts` + tests | 6 | 6 | P3-C25 | ⬜ NOT_STARTED |
| P3-C27 | Create `src/gateway/AgentGradeApiGateway.ts` + tests | 8 | 8 | P3-C6, P3-C7 | ⬜ NOT_STARTED |
| P3-C28 | Create `src/gateway/PaymentChallengeMiddleware.ts` + tests | 8 | 8 | P3-C17, P3-C27 | ⬜ NOT_STARTED |
| P3-C29 | Create `src/gateway/InboundTrustMiddleware.ts` + tests | 8 | 8 | P3-C6, P3-C27 | ⬜ NOT_STARTED |
| P3-C30 | Create `src/gateway/CounterpartyRateLimiter.ts` + tests | 8 | 8 | P3-C7, P3-C27 | ⬜ NOT_STARTED |

---

### Wave 1 — Contract Freeze (P3-C1)

**P3-C1: Freeze Phase 3 shared contracts in `src/shared/types.ts`**

Add ALL Phase 3 contracts from `phase-3-master-blueprint-agent-empire.md` Section 9 to `src/shared/types.ts`.

**9.1 Trust types:**
```typescript
export interface AgentIdentity {
  agentId: string;
  tenantId: string;
  businessUnitId?: string;
  ownerType: "user" | "organization" | "system";
  ownerId: string;
  role: AgentRole;
  verificationStatus: "unverified" | "verified" | "restricted" | "revoked";
  walletBindings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Mandate {
  mandateId: string;
  tenantId: string;
  businessUnitId?: string;
  principalId: string;
  delegatedAgentId: string;
  purpose: string;
  scope: string[];
  maxAmount?: number;
  currency?: string;
  allowedMerchants?: string[];
  allowedCategories?: string[];
  expiresAt: string;
  status: "active" | "expired" | "revoked" | "consumed";
  createdAt: string;
}

export interface CounterpartyRecord {
  counterpartyId: string;
  displayName: string;
  counterpartyType: "merchant" | "mcp_server" | "api_provider" | "agent_platform";
  trustStatus: "trusted" | "watch" | "blocked" | "unknown";
  riskScore: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

**9.2 Evidence types:**
```typescript
export interface EvidenceRecord {
  evidenceId: string;
  tenantId: string;
  questionId: string;
  sourceUrl: string;
  sourceType: "webpage" | "api" | "document" | "registry";
  fetchedAt: string;
  publishedAt?: string;
  contentHash: string;
  trustScore: number;
  freshnessScore: number;
}

export interface AtomicClaim {
  claimId: string;
  evidenceId: string;
  statement: string;
  confidence: number;
  extractedAt: string;
}

export interface ResearchReport {
  reportId: string;
  tenantId: string;
  question: string;
  answer: string;
  claims: AtomicClaim[];
  evidenceIds: string[];
  freshnessDate: string;
  confidence: number;
  gaps: string[];
  recommendedNextAction?: string;
}
```

**9.3 Commerce types:**
```typescript
export interface CommerceQuote {
  quoteId: string;
  tenantId: string;
  businessUnitId?: string;
  counterpartyId: string;
  lineItems: Array<{
    description: string;
    amount: number;
    currency: string;
    quantity: number;
  }>;
  totalAmount: number;
  currency: string;
  expiresAt: string;
  createdAt: string;
}

export interface PaymentAuthorization {
  authorizationId: string;
  tenantId: string;
  businessUnitId?: string;
  agentId: string;
  mandateId?: string;
  quoteId?: string;
  rail: "stripe" | "x402" | "mcp_pay" | "coinbase_wallet";
  status: "authorized" | "challenged" | "denied" | "expired";
  amount: number;
  currency: string;
  createdAt: string;
}

export interface CommerceReceipt {
  receiptId: string;
  tenantId: string;
  businessUnitId?: string;
  agentId: string;
  counterpartyId: string;
  rail: "stripe" | "x402" | "mcp_pay" | "coinbase_wallet";
  externalTransactionId?: string;
  mandateId?: string;
  quoteId?: string;
  amount: number;
  currency: string;
  status: "pending" | "settled" | "failed" | "refunded" | "credited";
  createdAt: string;
}

export interface WalletPolicy {
  walletPolicyId: string;
  tenantId: string;
  walletId: string;
  maxPerTransaction?: number;
  maxPerSession?: number;
  maxDailyOutflow?: number;
  allowedAssets: string[];
  allowedMerchants?: string[];
  allowedCategories?: string[];
  requiresManualApprovalAbove?: number;
}
```

**9.4 Discovery types:**
```typescript
export interface ExternalCapabilityManifest {
  manifestId: string;
  tenantId: string;
  businessUnitId: string;
  serviceName: string;
  version: string;
  baseUrl: string;
  authScheme: "api_key" | "oauth" | "a402" | "internal_only";
  paymentRail?: "stripe" | "x402" | "mcp_pay";
  supportedOperations: string[];
  reliabilityScore?: number;
  trustBadge?: string;
  createdAt: string;
}
```

**Additional types needed (add alongside the above):**
```typescript
export type CommerceRail = "stripe" | "x402" | "mcp_pay" | "coinbase_wallet";

export type TrustLevel = 0 | 1 | 2 | 3 | 4;

export interface TrustAuditEntry {
  entryId: string;
  tenantId: string;
  eventType: "identity_issued" | "identity_verified" | "identity_revoked"
    | "mandate_created" | "mandate_revoked" | "mandate_consumed"
    | "counterparty_added" | "counterparty_blocked"
    | "verification_override" | "wallet_bound" | "wallet_frozen";
  subjectId: string;
  actorId: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface CommerceEvent {
  eventId: string;
  tenantId: string;
  eventType: "quote_created" | "authorized" | "challenged" | "captured"
    | "settled" | "refunded" | "credited" | "disputed" | "reconciled";
  receiptId?: string;
  quoteId?: string;
  amount: number;
  currency: string;
  rail: CommerceRail;
  timestamp: string;
}

export interface TreasuryBalance {
  walletId: string;
  tenantId: string;
  asset: string;
  available: number;
  held: number;
  updatedAt: string;
}
```

Copy the exact type definitions from the blueprint Section 9. Use branded types where IDs exist (use existing branded type pattern from Phase 2).
Verify: `npx tsc --noEmit`

---

### Wave 2 — Trust Plane (P3-C2 through P3-C10)

All files go in `src/trust/`. This is the identity and authorization backbone.

**P3-C2: Create `src/trust/IAgentIdentityService.ts`**
Interface for agent identity lifecycle:
```typescript
interface IAgentIdentityService {
  issue(params: { tenantId: string; ownerId: string; ownerType: AgentIdentity['ownerType']; role: AgentRole; businessUnitId?: string }): Promise<AgentIdentity>
  get(agentId: string): Promise<AgentIdentity | null>
  verify(agentId: string): Promise<AgentIdentity>
  restrict(agentId: string, reason: string): Promise<AgentIdentity>
  revoke(agentId: string, reason: string): Promise<AgentIdentity>
  bindWallet(agentId: string, walletId: string): Promise<AgentIdentity>
  listByTenant(tenantId: string): Promise<AgentIdentity[]>
}
```
Verify: `npx tsc --noEmit`

**P3-C3: Create `src/trust/AgentIdentityService.ts` + tests**
Implements `IAgentIdentityService`. In-memory store (Map-backed) for now — Postgres adapter later.
- Issues identities with `verificationStatus: "unverified"`
- Stores and retrieves by `agentId`
- Verification transitions: `unverified → verified → restricted → revoked` (no backward transitions except `restricted → verified`)
- Wallet binding appends to `walletBindings[]`
- All state changes emit to `TrustAuditLog` (inject as dependency)
Min 10 tests: issue identity, get by ID, verify, restrict, revoke, bind wallet, list by tenant, tenant isolation, invalid transition rejection, duplicate issue rejection.
Verify: `npx vitest run src/trust/AgentIdentityService.test.ts`

**P3-C4: Create `src/trust/IMandateService.ts`**
Interface for delegated authority:
```typescript
interface IMandateService {
  create(params: Omit<Mandate, 'mandateId' | 'status' | 'createdAt'>): Promise<Mandate>
  get(mandateId: string): Promise<Mandate | null>
  validate(mandateId: string, action: { amount?: number; merchant?: string; category?: string }): Promise<{ valid: boolean; reason?: string }>
  revoke(mandateId: string): Promise<Mandate>
  consume(mandateId: string): Promise<Mandate>
  listByAgent(agentId: string): Promise<Mandate[]>
  listActive(tenantId: string): Promise<Mandate[]>
}
```
Verify: `npx tsc --noEmit`

**P3-C5: Create `src/trust/MandateService.ts` + tests**
Implements `IMandateService`. In-memory store.
- Creates mandates with `status: "active"`
- Validates against scope, amount, merchant, category, and expiry
- Revocation is immediate and irreversible
- Consumed mandates cannot be reused
- Expired mandates auto-reject on validation
- All state changes emit to `TrustAuditLog`
Min 10 tests: create mandate, validate within scope, reject over amount, reject expired, reject wrong merchant, revoke, consume, list by agent, list active by tenant, tenant isolation.
Verify: `npx vitest run src/trust/MandateService.test.ts`

**P3-C6: Create `src/trust/VerificationPolicyEngine.ts` + tests**
Enforces Know Your Agent rules per trust level (blueprint Section 13.2):
- Level 0: read-only browsing — `unverified` agents allowed
- Level 1: external API calls — requires `verified` status
- Level 2: payment-capable — requires `verified` + active mandate
- Level 3: wallet spend/settlement — requires `verified` + mandate + wallet binding
- Level 4: sensitive enterprise — requires `verified` + mandate + manual approval flag
- Maps action types to required trust levels
- Returns structured `{ allowed: boolean; requiredLevel: TrustLevel; agentLevel: TrustLevel; reason?: string }`

Inject: `IAgentIdentityService`, `IMandateService`.
Min 8 tests: level 0 passes unverified, level 1 rejects unverified, level 2 requires mandate, level 3 requires wallet, level 4 requires manual flag, revoked agent blocked at all levels, restricted agent blocked above level 0, custom action-to-level mapping.
Verify: `npx vitest run src/trust/VerificationPolicyEngine.test.ts`

**P3-C7: Create `src/trust/CounterpartyRegistry.ts` + tests**
Maintains known external entities (merchants, MCP providers, API sellers, agent platforms).
- CRUD operations on `CounterpartyRecord`
- Trust status transitions: `unknown → trusted`, `unknown → watch`, `watch → blocked`, `trusted → watch → blocked`
- Risk score computation (starts at 50, adjusts based on history)
- Tag-based filtering
- Tenant-scoped
Min 8 tests: add counterparty, get by ID, update trust status, block counterparty, filter by type, filter by tag, risk score update, tenant isolation.
Verify: `npx vitest run src/trust/CounterpartyRegistry.test.ts`

**P3-C8: Create `src/trust/AgentReputationService.ts` + tests**
Computes trust indicators for internal agents:
- Tracks: delivery success rate, refund rate, dispute rate, policy violations, uptime
- Accepts reputation events: `task_completed`, `task_failed`, `refund_issued`, `dispute_filed`, `policy_violation`, `heartbeat`
- Computes composite reputation score (0–100)
- Returns structured reputation report
- Inject: `IAgentIdentityService` (read-only for identity lookup)
Min 8 tests: record success, record failure, compute score, refund impacts score, dispute impacts score, policy violation impacts score, score decay over time, multiple agents independent.
Verify: `npx vitest run src/trust/AgentReputationService.test.ts`

**P3-C9: Create `src/trust/TrustAuditLog.ts` + tests**
Immutable append-only audit trail for all trust plane events:
- Accepts `TrustAuditEntry` records
- Append-only — no update, no delete
- Query by `tenantId`, `subjectId`, `eventType`, time range
- Uses structured JSON format (pino logger compatible)
- In-memory array store for now — Postgres append-only table later
Min 6 tests: append entry, query by tenant, query by subject, query by event type, query by time range, immutability (no delete/update methods).
Verify: `npx vitest run src/trust/TrustAuditLog.test.ts`

**P3-C10: Create `src/trust/RevocationService.ts` + tests**
Fast, global revocation of agents, mandates, and wallet bindings:
- `revokeAgent(agentId)` — calls `AgentIdentityService.revoke()` + revokes all active mandates + freezes wallet bindings
- `revokeMandate(mandateId)` — calls `MandateService.revoke()`
- `freezeWallet(walletId)` — marks wallet as frozen in identity service
- `revokeCounterparty(counterpartyId)` — marks as blocked in `CounterpartyRegistry`
- All actions emit to `TrustAuditLog`
- Emits `SystemEvent` for dashboard alerting

Inject: `IAgentIdentityService`, `IMandateService`, `CounterpartyRegistry`, `TrustAuditLog`.
Min 8 tests: revoke agent cascades mandates, revoke agent freezes wallets, revoke single mandate, freeze wallet, revoke counterparty, audit log entries created, system event emitted, idempotent revocation (already revoked = no-op).
Verify: `npx vitest run src/trust/RevocationService.test.ts`

---

### Wave 4 — Commerce Core (P3-C11 through P3-C17)

All files go in `src/commerce/`. This is the canonical internal payment API.

**P3-C11: Create `src/commerce/ICommerceOrchestrator.ts` + `src/commerce/ICommerceRailAdapter.ts`**
Two interfaces:

```typescript
// ICommerceOrchestrator.ts — canonical internal payment API
interface ICommerceOrchestrator {
  createQuote(params: Omit<CommerceQuote, 'quoteId' | 'createdAt'>): Promise<CommerceQuote>
  authorize(quoteId: string, agentId: string, mandateId?: string): Promise<PaymentAuthorization>
  capture(authorizationId: string): Promise<CommerceReceipt>
  refund(receiptId: string, amount?: number): Promise<CommerceReceipt>
  issueCredit(receiptId: string, amount: number): Promise<CommerceReceipt>
  getReceipt(receiptId: string): Promise<CommerceReceipt | null>
  reconcile(tenantId: string): Promise<{ matched: number; unmatched: number; issues: string[] }>
}

// ICommerceRailAdapter.ts — provider-agnostic rail interface
interface ICommerceRailAdapter {
  readonly rail: CommerceRail
  authorize(quote: CommerceQuote, mandate?: Mandate): Promise<{ externalId: string; status: 'authorized' | 'challenged' | 'denied' }>
  capture(externalId: string, amount: number, currency: string): Promise<{ externalTransactionId: string; status: 'settled' | 'failed' }>
  refund(externalTransactionId: string, amount: number): Promise<{ status: 'refunded' | 'failed' }>
  getSettlementStatus(externalTransactionId: string): Promise<{ status: string; settledAt?: string }>
}
```
Verify: `npx tsc --noEmit`

**P3-C12: Create `src/commerce/QuoteService.ts` + tests**
Creates and manages `CommerceQuote` records:
- Generates unique `quoteId`
- Validates line items (positive amounts, valid currency)
- Enforces quote expiry (default 15 minutes)
- Looks up `CounterpartyRecord` to verify counterparty is not blocked
- Tenant-scoped storage
Min 8 tests: create quote, validate line items, reject negative amount, reject blocked counterparty, quote expiry, get quote, list by tenant, expired quote rejection on retrieve.
Verify: `npx vitest run src/commerce/QuoteService.test.ts`

**P3-C13: Create `src/commerce/ReceiptService.ts` + tests**
Creates and manages `CommerceReceipt` records:
- Issues receipts after successful capture
- Tracks receipt status transitions: `pending → settled → refunded | credited`
- Links to quote, mandate, and external transaction IDs
- Append receipt events to `CommerceEvent` ledger
- Tenant-scoped
Min 8 tests: create receipt, update status, link to quote, link to mandate, status transition validation, invalid transition rejection, list by tenant, list by agent.
Verify: `npx vitest run src/commerce/ReceiptService.test.ts`

**P3-C14: Create `src/commerce/DisputeService.ts` + tests**
Handles payment disputes:
- Open dispute against a `CommerceReceipt`
- Attach evidence (text descriptions, reference IDs)
- Status transitions: `opened → under_review → resolved_for_buyer | resolved_for_seller | escalated`
- Links disputes to receipts and counterparties
- Emits `CommerceEvent` entries
Min 6 tests: open dispute, attach evidence, resolve for buyer, resolve for seller, escalate, reject dispute on already-refunded receipt.
Verify: `npx vitest run src/commerce/DisputeService.test.ts`

**P3-C15: Create `src/commerce/RefundPolicyEngine.ts` + tests**
Deterministic refund/credit decision engine (blueprint Section 14.2):
- Low risk + low amount (< configurable threshold): auto-refund
- Medium risk: auto-credit (credit balance, not cash refund)
- High risk: return `manual_review_required`
- Factors: amount, time since purchase, agent reputation score, dispute history
- Returns `{ decision: 'auto_refund' | 'auto_credit' | 'manual_review'; reason: string }`
Min 8 tests: auto-refund low amount, auto-credit medium, manual review high amount, time decay factor, reputation factor, dispute history factor, configurable thresholds, edge case at boundary.
Verify: `npx vitest run src/commerce/RefundPolicyEngine.test.ts`

**P3-C16: Create `src/commerce/SettlementReconciler.ts` + tests**
Compares internal ledger vs provider settlement status:
- Iterates pending/settled receipts
- Calls rail adapter `getSettlementStatus()` for each
- Detects: duplicates, missing captures, stale pending settlements, amount mismatches
- Returns structured reconciliation report
- Emits `CommerceEvent` for discrepancies
Min 8 tests: all matched, missing capture detected, duplicate detected, stale pending detected, amount mismatch, empty ledger, multi-rail reconciliation, tenant scoping.
Verify: `npx vitest run src/commerce/SettlementReconciler.test.ts`

**P3-C17: Create `src/commerce/CommerceOrchestrator.ts` + tests**
Implements `ICommerceOrchestrator`. The canonical payment flow coordinator:
1. `createQuote` → delegates to `QuoteService`
2. `authorize` → validates mandate via `IMandateService` + `VerificationPolicyEngine` → delegates to rail adapter
3. `capture` → calls rail adapter capture → creates receipt via `ReceiptService`
4. `refund` → evaluates via `RefundPolicyEngine` → calls rail adapter refund → updates receipt
5. `issueCredit` → creates credit receipt
6. `reconcile` → delegates to `SettlementReconciler`
- All actions emit `CommerceEvent` to append-only ledger
- All payment actions require trust level >= 2

Inject: `QuoteService`, `ReceiptService`, `RefundPolicyEngine`, `SettlementReconciler`, `IMandateService`, `VerificationPolicyEngine`, `TrustAuditLog`, rail adapters (Map<CommerceRail, ICommerceRailAdapter>).
Min 10 tests: full quote→authorize→capture→receipt flow, mandate validation, trust level enforcement, refund flow, credit flow, reconcile, blocked counterparty rejection, expired quote rejection, multi-rail routing, audit trail verification.
Verify: `npx vitest run src/commerce/CommerceOrchestrator.test.ts`

---

### Wave 5 — Provider Adapters (P3-C18 through P3-C22)

All files go in `src/commerce/adapters/`. Each implements `ICommerceRailAdapter`.
All adapters are **stubbed implementations** for Phase 3 — they define the interface contract and simulate provider responses. Real provider integration comes in Phase 4.

**P3-C18: Create `src/commerce/adapters/StripeCommerceAdapter.ts` + tests**
Implements `ICommerceRailAdapter` for `rail: "stripe"`.
- Simulates: PaymentIntent create (authorize), capture, refund
- Generates mock `externalTransactionId` in format `pi_test_*`
- Validates amount > 0 and currency is supported (USD, EUR, GBP)
- Challenge flow: amounts > configurable threshold return `challenged`
Min 6 tests: authorize success, authorize challenge for high amount, capture, refund, invalid currency rejection, settlement status.
Verify: `npx vitest run src/commerce/adapters/StripeCommerceAdapter.test.ts`

**P3-C19: Create `src/commerce/adapters/X402Adapter.ts` + tests**
Implements `ICommerceRailAdapter` for `rail: "x402"`.
- Simulates: 402-style payment challenge/response for machine-to-machine API payments
- Pay-per-call pricing model
- Generates mock `externalTransactionId` in format `x402_*`
Min 6 tests: authorize, capture, refund, challenge flow, settlement status, pay-per-call pricing.
Verify: `npx vitest run src/commerce/adapters/X402Adapter.test.ts`

**P3-C20: Create `src/commerce/adapters/CoinbaseWalletAdapter.ts` + tests**
Implements `ICommerceRailAdapter` for `rail: "coinbase_wallet"`.
- Simulates: wallet-native crypto spend and settlement
- Supports asset allowlists (USDC, ETH)
- Generates mock `externalTransactionId` in format `cb_*`
Min 6 tests: authorize, capture, refund, unsupported asset rejection, settlement status, wallet balance check.
Verify: `npx vitest run src/commerce/adapters/CoinbaseWalletAdapter.test.ts`

**P3-C21: Create `src/commerce/adapters/McpPayAdapter.ts` + tests**
Implements `ICommerceRailAdapter` for `rail: "mcp_pay"`.
- Simulates: MCP tool monetization payments (per-call or per-session)
- Generates mock `externalTransactionId` in format `mcp_*`
Min 6 tests: authorize, capture, refund, per-call billing, per-session billing, settlement status.
Verify: `npx vitest run src/commerce/adapters/McpPayAdapter.test.ts`

**P3-C22: Create `src/commerce/adapters/AP2MandateAdapter.ts` + tests**
Adapts AP2-style authorization concepts for mandate-based payment flows:
- Maps internal `Mandate` to AP2 authorization chain format
- Validates delegation chain integrity
- Produces authorization proof for audit
- This is NOT a payment rail — it wraps mandate verification for use by other adapters
Min 6 tests: mandate to AP2 mapping, chain validation, expired mandate rejection, revoked mandate rejection, authorization proof generation, scope validation.
Verify: `npx vitest run src/commerce/adapters/AP2MandateAdapter.test.ts`

---

### Wave 6 — Wallet & Treasury Controls (P3-C23 through P3-C26)

**P3-C23: Create `src/commerce/wallets/WalletPolicyEngine.ts` + tests**
Enforces wallet spend policies (blueprint Section 8.3):
- `evaluate(walletId: string, transaction: { amount: number; asset: string; merchant?: string; category?: string })` → `{ allowed: boolean; reason?: string }`
- Checks: `maxPerTransaction`, `maxPerSession`, `maxDailyOutflow`, `allowedAssets`, `allowedMerchants`, `allowedCategories`, `requiresManualApprovalAbove`
- Tracks session totals and daily outflow in-memory
- Emergency freeze: `freeze(walletId)` → all transactions rejected until `unfreeze(walletId)`

Min 8 tests: within limits passes, over per-transaction limit, over daily outflow, disallowed asset, disallowed merchant, freeze blocks all, unfreeze restores, manual approval threshold.
Verify: `npx vitest run src/commerce/wallets/WalletPolicyEngine.test.ts`

**P3-C24: Create `src/commerce/wallets/WalletBindingService.ts` + tests**
Manages wallet-to-agent bindings:
- Bind wallet to agent (agent must be verified)
- Unbind wallet
- List wallets for agent
- List agents for wallet
- Enforce: one agent can have multiple wallets, one wallet bound to one agent at a time
- All changes emit to `TrustAuditLog`

Inject: `IAgentIdentityService`, `TrustAuditLog`.
Min 6 tests: bind wallet, unbind, list by agent, list by wallet, reject bind to unverified agent, reject double-bind.
Verify: `npx vitest run src/commerce/wallets/WalletBindingService.test.ts`

**P3-C25: Create `src/commerce/treasury/TreasuryService.ts` + tests**
Manages treasury operations:
- `getBalance(walletId)` → `TreasuryBalance`
- `hold(walletId, amount, asset)` → moves from `available` to `held`
- `release(walletId, amount, asset)` → moves from `held` to `available`
- `debit(walletId, amount, asset)` → deducts from `held` (must hold first)
- `credit(walletId, amount, asset)` → adds to `available`
- `sweep(fromWalletId, toWalletId, asset)` → moves all available balance
- All operations emit to append-only treasury ledger

Inject: `WalletPolicyEngine`, `TreasuryLedger`.
Min 10 tests: get balance, hold, release, debit, credit, insufficient funds rejection, sweep, hold exceeds available rejection, debit exceeds held rejection, ledger entries created.
Verify: `npx vitest run src/commerce/treasury/TreasuryService.test.ts`

**P3-C26: Create `src/commerce/treasury/TreasuryLedger.ts` + tests**
Append-only ledger for all treasury operations:
- Records: `hold`, `release`, `debit`, `credit`, `sweep`, `freeze`, `unfreeze`
- Each entry: `{ entryId, walletId, tenantId, operation, amount, asset, balanceBefore, balanceAfter, timestamp }`
- Query by wallet, tenant, time range, operation type
- Immutable — no update, no delete
Min 6 tests: append entry, query by wallet, query by tenant, query by operation, query by time range, immutability.
Verify: `npx vitest run src/commerce/treasury/TreasuryLedger.test.ts`

---

### Wave 8 — Gateway & Edge Hardening (P3-C27 through P3-C30)

All files go in `src/gateway/`.

**P3-C27: Create `src/gateway/AgentGradeApiGateway.ts` + tests**
Entry point for all external agent requests:
- JSON schema validation on inbound requests (Zod)
- Route matching and handler dispatch
- Error normalization (structured error responses)
- Request/response logging
- Applies middleware chain: trust → rate limit → payment challenge → handler
Min 8 tests: valid request passes, invalid schema rejected, error normalization, middleware chain execution order, 404 for unknown routes, request logging, structured error format, health check bypass.
Verify: `npx vitest run src/gateway/AgentGradeApiGateway.test.ts`

**P3-C28: Create `src/gateway/PaymentChallengeMiddleware.ts` + tests**
Implements 402-style payment challenge for paid endpoints:
- Routes marked as paid return `402 Payment Required` with challenge payload
- Challenge contains: required amount, accepted rails, quote endpoint
- Accepts payment proof in subsequent request headers
- Validates payment proof against `ReceiptService`
Min 6 tests: free route passes through, paid route returns 402, valid payment proof accepted, invalid proof rejected, expired proof rejected, challenge payload structure.
Verify: `npx vitest run src/gateway/PaymentChallengeMiddleware.test.ts`

**P3-C29: Create `src/gateway/InboundTrustMiddleware.ts` + tests**
Verifies identity and trust of inbound agents:
- Extracts agent identity from request headers
- Validates against `CounterpartyRegistry`
- Blocks `blocked` counterparties
- Applies `watch` counterparties with rate limit reduction
- Logs all inbound agent requests to `TrustAuditLog`
- Suppresses recursive traffic (agent calling itself)

Inject: `CounterpartyRegistry`, `TrustAuditLog`.
Min 8 tests: trusted agent passes, blocked agent rejected, watch agent rate-limited, unknown agent allowed (default open), missing identity header handling, recursive traffic suppression, audit log entry, multiple identity formats.
Verify: `npx vitest run src/gateway/InboundTrustMiddleware.test.ts`

**P3-C30: Create `src/gateway/CounterpartyRateLimiter.ts` + tests**
Agent-aware rate limiting that goes beyond IP-based:
- Rate limits by counterparty ID (not just IP)
- Different limits per trust status: `trusted` = high, `watch` = low, `unknown` = medium, `blocked` = 0
- Configurable window and limits
- Returns 429 with retry-after header
- In-memory window tracking (same pattern as existing `src/server/middleware.ts`)

Min 6 tests: within limit passes, over limit returns 429, trusted gets higher limit, watch gets lower limit, blocked gets zero, retry-after header correct.
Verify: `npx vitest run src/gateway/CounterpartyRateLimiter.test.ts`

---

### Key Constraints for Phase 3

- **Trust before autonomy.** No payment-capable action without identity + mandate + policy + audit.
- **Evidence before memory.** Research never writes directly into durable memory.
- **Ledger before money.** Every financial action has an append-only ledger entry.
- **Adapters before lock-in.** Provider payloads never leak into core business logic. CommerceOrchestrator is the only payment API.
- **Rail adapters are stubbed.** Phase 3 defines contracts and simulates responses. Real provider integration comes later.
- **Existing tests must keep passing.** All Phase 1/2 tests must remain green.
- **Tenant isolation in code.** Every query, every ledger, every store is tenant-scoped.
- **Do NOT give workers wallet authority.** Workers cannot spend. Only the CommerceOrchestrator can authorize payments through mandates.

---

## What You Do NOT Build (Phase 3)

- Evidence Plane — ResearchBroker, EvidenceStore, ClaimExtractor, etc. (GEMINI)
- Discovery Plane — InternalServiceRegistry, ExternalManifestPublisher, etc. (GEMINI)
- Hive Mind V2 namespace updates (GEMINI)
- Dashboard Phase 3 components (GEMINI)
- DI container wiring for Phase 3 planes (OPUS)
- Phase 3 integration tests (OPUS)
- Controlled chaos protocol tests (OPUS)
- Config updates for Phase 3 (OPUS)

Do not touch files owned by other agents. Mock missing interfaces in tests.

---

## Phase 3 Launch Prompt

```
Read AGENTS.md Sections 1-9. Then read CODEX-ASSIGNMENT.md (Phase 3 section).
Read phase-3-master-blueprint-agent-empire.md for full context.

BRANCH DISCIPLINE:
- Create and work in branch: agent/codex/phase-3-trust-commerce
- Push to main ONLY when a task is complete and verified
- Never push partial or failing work to main

Execute Phase 3 tasks in wave order (1 → 2 → 4 → 5 → 6 → 8).
Wave 1 (P3-C1) has no dependencies — start immediately.
Wave 2 (Trust Plane) depends on P3-C1.
Wave 4 (Commerce Core) depends on P3-C1. Can run in parallel with Wave 2.
Wave 5 (Adapters) depends on P3-C11 (interfaces).
Wave 6 (Wallet/Treasury) depends on P3-C23, P3-C17.
Wave 8 (Gateway) depends on Trust Plane completion.

Run `npx tsc --noEmit && npx vitest run` after each task.
Commit: `[CODEX:component] Phase 3 Seq N: description`
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
Continue until all tasks show PASS or are BLOCKED.
```
