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

## Phase 3 — Trusted External Operations: Wiring, Integration, Chaos

Branch: `agent/opus/phase-3-integration`
Ref: `phase-3-master-blueprint-agent-empire.md` Sections 7–17

**IMPORTANT — Branch Discipline:**
- Work ONLY in branch `agent/opus/phase-3-integration`
- Push to `main` ONLY when a task is complete and verified (`npx tsc --noEmit && npx vitest run` both PASS)
- Never push partial or failing work to `main`
- OPUS tasks depend on CODEX and GEMINI completing their plane implementations first. If blocked, review their submissions and prepare integration test plans.

OPUS owns: Phase 3 contract review, DI container wiring for all four new planes, config updates, integration tests across plane boundaries, and controlled chaos protocol tests. CODEX builds Trust + Commerce + Gateway. GEMINI builds Evidence + Discovery + Dashboard.

**OPUS role in Phase 3:** Architect, review contract freeze, wire all planes into DI container, write cross-plane integration tests, design and execute controlled chaos protocol, review all CODEX/GEMINI submissions.

### Phase 3 Task Table

| # | Task | Wave | Seq | Depends On | Status |
|---|------|------|-----|------------|--------|
| P3-O1 | Review and validate Phase 3 contracts (pre-freeze) | 1 | 1 | None | ✅ PASS |
| P3-O2 | Wire Trust Plane into `src/server/container.ts` | 9 | 9 | P3-C10 (Trust Plane complete) | ✅ PASS |
| P3-O3 | Wire Evidence Plane into `src/server/container.ts` | 9 | 9 | P3-G7 (Evidence Plane complete) | ✅ PASS |
| P3-O4 | Wire Commerce Plane into `src/server/container.ts` | 9 | 9 | P3-C17, P3-C22 (Commerce + Adapters) | ✅ PASS |
| P3-O5 | Wire Discovery Plane into `src/server/container.ts` | 9 | 9 | P3-G12 (Discovery Plane complete) | ✅ PASS |
| P3-O6 | Wire Gateway into server routes | 9 | 9 | P3-C30 (Gateway complete) | ✅ PASS |
| P3-O7 | Update `src/shared/config.ts` for Phase 3 | 9 | 9 | P3-C1 | ✅ PASS |
| P3-O8 | Integration test — Trust Plane end-to-end | 9 | 9 | P3-O2 | ✅ PASS |
| P3-O9 | Integration test — Evidence Plane end-to-end | 9 | 9 | P3-O3 | ✅ PASS |
| P3-O10 | Integration test — Commerce Plane end-to-end | 9 | 9 | P3-O4 | ✅ PASS |
| P3-O11 | Integration test — Cross-plane trust→commerce mandate | 9 | 9 | P3-O2, P3-O4 | ✅ PASS |
| P3-O12 | Controlled chaos protocol tests | 9 | 9 | P3-O8 thru P3-O11 | ✅ PASS |

---

### Wave 1 — Contract Review (P3-O1)

**P3-O1: Review and validate Phase 3 contracts (pre-freeze)**
Before CODEX commits P3-C1, OPUS reviews the proposed type additions:
- Verify all types from blueprint Section 9 are present and exact
- Verify branded types are used where IDs exist (consistent with Phase 2 pattern)
- Verify no naming conflicts with existing Phase 2 types
- Verify `CommerceRail`, `TrustLevel`, `TrustAuditEntry`, `CommerceEvent`, `TreasuryBalance` supplemental types are included
- Verify all types are exported from `src/shared/types.ts`
- Sign off or return with corrections

This is a review task — no code written. Output: approval or correction list for CODEX.

---

### Wave 9 — DI Wiring + Integration (P3-O2 through P3-O12)

All OPUS Phase 3 implementation happens after CODEX and GEMINI complete their planes. OPUS wires everything together and validates cross-boundary behavior.

**P3-O2: Wire Trust Plane into `src/server/container.ts`**
Register all Trust Plane services in the DI container:
- `TrustAuditLog` (singleton — shared by all trust services)
- `AgentIdentityService` (inject: `TrustAuditLog`)
- `MandateService` (inject: `TrustAuditLog`)
- `CounterpartyRegistry`
- `VerificationPolicyEngine` (inject: `AgentIdentityService`, `MandateService`)
- `AgentReputationService` (inject: `AgentIdentityService`)
- `RevocationService` (inject: `AgentIdentityService`, `MandateService`, `CounterpartyRegistry`, `TrustAuditLog`)

Expose `IAgentIdentityService`, `IMandateService`, `VerificationPolicyEngine` on container interface for other planes to consume.
Verify: `npx tsc --noEmit && npx vitest run`

**P3-O3: Wire Evidence Plane into `src/server/container.ts`**
Register all Evidence Plane services:
- `SourcePolicyEngine`
- `EvidenceStore`
- `ClaimExtractor`
- `FreshnessScorer`
- `CitationCompiler`
- `ResearchReportBuilder`
- `ResearchBroker` (inject: all above)

Expose `IResearchBroker` on container interface.
Wire `ResearchBroker` memory proposals to `Librarian.submitProposal` (same pattern as `WorkerTaskExecutor`).
Verify: `npx tsc --noEmit && npx vitest run`

**P3-O4: Wire Commerce Plane into `src/server/container.ts`**
Register all Commerce Plane services:
- `QuoteService` (inject: `CounterpartyRegistry`)
- `ReceiptService`
- `DisputeService` (inject: `ReceiptService`)
- `RefundPolicyEngine`
- `SettlementReconciler`
- All rail adapters: `StripeCommerceAdapter`, `X402Adapter`, `CoinbaseWalletAdapter`, `McpPayAdapter`, `AP2MandateAdapter`
- `CommerceOrchestrator` (inject: `QuoteService`, `ReceiptService`, `RefundPolicyEngine`, `SettlementReconciler`, `IMandateService`, `VerificationPolicyEngine`, `TrustAuditLog`, rail adapter map)
- `WalletPolicyEngine`
- `WalletBindingService` (inject: `AgentIdentityService`, `TrustAuditLog`)
- `TreasuryLedger`
- `TreasuryService` (inject: `WalletPolicyEngine`, `TreasuryLedger`)

Expose `ICommerceOrchestrator`, `TreasuryService`, `WalletPolicyEngine` on container interface.
Verify: `npx tsc --noEmit && npx vitest run`

**P3-O5: Wire Discovery Plane into `src/server/container.ts`**
Register all Discovery Plane services:
- `InternalServiceRegistry`
- `DiscoveryPolicyEngine`
- `ExternalManifestPublisher` (inject: `InternalServiceRegistry`, `DiscoveryPolicyEngine`)
- `ProtocolInjectionSwarm` (inject: `ExternalManifestPublisher`)

Expose `InternalServiceRegistry`, `ExternalManifestPublisher` on container interface.
Verify: `npx tsc --noEmit && npx vitest run`

**P3-O6: Wire Gateway into server routes**
Integrate gateway middleware into the Hono server:
- Add `InboundTrustMiddleware` to inbound request chain
- Add `CounterpartyRateLimiter` after trust middleware
- Add `PaymentChallengeMiddleware` for routes marked as paid
- Register `AgentGradeApiGateway` routes under `/api/v2/` prefix
- Preserve ALL existing `/api/` routes (backward compat)
- Add Phase 3 API routes:
  - `POST /api/v2/research` — trigger research via `IResearchBroker`
  - `GET /api/v2/trust/agents` — list agent identities
  - `POST /api/v2/commerce/quote` — create commerce quote
  - `GET /api/v2/discovery/services` — list available services
  - `GET /api/v2/evidence/:id` — get evidence record

Verify: `npx tsc --noEmit && npx vitest run`

**P3-O7: Update `src/shared/config.ts` for Phase 3**
Add configuration fields:
```typescript
// Trust
trustAuditLogPath?: string;
defaultTrustLevel?: TrustLevel;
mandateDefaultExpiryMs?: number;

// Evidence
researchMaxSources?: number;
researchDefaultFreshness?: 'realtime' | 'recent' | 'any';
evidenceStorePath?: string;

// Commerce
defaultPaymentRail?: CommerceRail;
quoteExpiryMs?: number;
autoRefundThreshold?: number;
manualReviewThreshold?: number;

// Wallet
walletDefaultMaxPerTransaction?: number;
walletDefaultMaxDailyOutflow?: number;

// Gateway
gatewayRateLimitTrusted?: number;
gatewayRateLimitWatch?: number;
gatewayRateLimitUnknown?: number;
```
Map from env vars with sensible defaults.
Verify: `npx tsc --noEmit`

---

### Integration Tests (P3-O8 through P3-O11)

All integration tests go in `src/integration/`.

**P3-O8: Integration test — Trust Plane end-to-end**
File: `src/integration/trustPlane.test.ts`
1. Issue agent identity (unverified)
2. Verify agent
3. Create mandate for agent
4. Validate mandate against action scope
5. Attempt action above trust level → blocked
6. Bind wallet to verified agent
7. Revoke agent → cascading mandate revocation + wallet freeze
8. Verify audit log contains all events

Min 6 tests: identity lifecycle, mandate lifecycle, trust level enforcement, wallet binding, cascading revocation, audit trail completeness.
Verify: `npx vitest run src/integration/trustPlane.test.ts`

**P3-O9: Integration test — Evidence Plane end-to-end**
File: `src/integration/evidencePlane.test.ts`
1. Submit research question via `ResearchBroker`
2. Source policy filters domains
3. Evidence stored with content hashes
4. Claims extracted from evidence
5. Freshness scored
6. Citations compiled
7. Research report generated with all required fields
8. Memory proposals emitted (NOT direct writes)
9. Librarian accepts/rejects proposals through normal pipeline

Min 5 tests: full research lifecycle, source policy enforcement, evidence dedup, memory proposal (not direct write), tenant scoping.
Verify: `npx vitest run src/integration/evidencePlane.test.ts`

**P3-O10: Integration test — Commerce Plane end-to-end**
File: `src/integration/commercePlane.test.ts`
1. Create commerce quote
2. Authorize payment (mandate check + trust level check)
3. Capture payment via rail adapter
4. Receipt issued with ledger entry
5. Refund evaluated by policy engine
6. Settlement reconciliation detects no issues
7. Commerce events logged in append-only ledger

Min 6 tests: full quote→pay→receipt flow, mandate validation blocks unauthorized, trust level blocks low-trust agent, refund policy auto-refund, refund policy manual review, reconciliation clean.
Verify: `npx vitest run src/integration/commercePlane.test.ts`

**P3-O11: Integration test — Cross-plane trust→commerce mandate check**
File: `src/integration/crossPlane.test.ts`
Tests that cross plane boundaries:
1. Agent must have verified identity to create commerce quote
2. Commerce payment requires active mandate with sufficient scope
3. Revoked agent's pending transactions are blocked
4. Research evidence feeds into commerce counterparty trust scoring
5. Discovery only publishes services that pass trust + policy checks

Min 5 tests: trust→commerce mandate flow, revocation blocks commerce, evidence→trust scoring, discovery publication gating, wallet freeze blocks treasury operations.
Verify: `npx vitest run src/integration/crossPlane.test.ts`

---

### Controlled Chaos Protocol (P3-O12)

**P3-O12: Controlled chaos protocol tests**
File: `src/integration/chaosProtocol.test.ts`
Blueprint Section 16 Sequence 9: Break trust, research, and payment paths intentionally and confirm clean self-arrest behavior.

Tests:
1. **Trust revocation cascade**: Revoke an agent mid-transaction → verify all pending mandates revoked, wallet frozen, in-flight commerce blocked, audit log complete
2. **Wallet emergency freeze**: Freeze wallet with pending transactions → verify all debits rejected, holds preserved, treasury ledger records freeze event
3. **Evidence freshness failure**: All evidence is stale → verify research report has low confidence, gaps populated, recommended next action suggests re-fetch
4. **Commerce rail failure**: Rail adapter returns `failed` on capture → verify receipt status = `failed`, refund policy evaluated, commerce event logged
5. **Counterparty block mid-flow**: Block counterparty after quote created → verify authorization denied, receipt not issued
6. **Mandate expiry during authorization**: Mandate expires between quote and authorize → verify authorization denied with clear reason

Min 6 tests covering the scenarios above.
Verify: `npx vitest run src/integration/chaosProtocol.test.ts`

---

### Key Constraints for Phase 3

- **OPUS does NOT implement plane internals.** OPUS wires, integrates, and tests. CODEX and GEMINI build the components.
- **DI wiring must be clean.** Each plane's services resolve through the container, not through direct imports.
- **Integration tests cover cross-boundary behavior**, not unit-level logic already tested by CODEX/GEMINI.
- **Chaos tests validate self-arrest behavior**, not just error handling. The system must stop cleanly, not crash.
- **Backward compatibility is non-negotiable.** All Phase 1/2 routes, tests, and behavior must remain intact.
- **Review before merge.** Every CODEX/GEMINI submission gets reviewed before merging to main.

---

## Phase 3 Integration Review Protocol

When CODEX or GEMINI complete a Phase 3 task and submit for review:
1. **Type compliance:** Must import from `src/shared/types.ts` only. No inline type definitions.
2. **Interface compliance:** Implementations must match interfaces exactly.
3. **Security invariants:**
   - No payment without mandate + trust level check
   - No research writing directly to durable memory
   - No wallet access without policy check
   - No provider payloads leaking into core logic
   - Tenant isolation in every store, query, and ledger
4. **Test quality:** Error paths tested, edge cases covered, deterministic, 6+ tests per service.
5. **Architectural boundaries:**
   - Trust Plane owns identity and authorization — Commerce Plane consumes, does not duplicate
   - Evidence Plane owns research — Memory Plane receives proposals only
   - Commerce Plane owns payment flows — adapters are replaceable
   - Discovery Plane gates publication — default is private
6. **Phase 3 guardrails:**
   - Workers cannot spend
   - Research cannot write memory directly
   - Provider adapters are stubbed (no real API calls)
   - Ledgers are append-only (no update, no delete)
7. **Verification:** Run full typecheck + test suite after merge.

If review fails: provide specific feedback, do not merge, return to owning agent for fixes.

---

## Phase 3 Launch Prompt

```
Read AGENTS.md Sections 1-9. Then read OPUS-ASSIGNMENT.md (Phase 3 section).
Read phase-3-master-blueprint-agent-empire.md for full architectural context.

BRANCH DISCIPLINE:
- Create and work in branch: agent/opus/phase-3-integration
- Push to main ONLY when a task is complete and verified
- Never push partial or failing work to main

You are the architect. Your Phase 3 role:
1. Review P3-C1 contract freeze (Wave 1) — validate before CODEX commits
2. Wait for CODEX and GEMINI to complete their planes
3. Between waiting, review their submissions using the Integration Review Protocol
4. Wire all planes into container.ts (Wave 9)
5. Write integration tests (Wave 9)
6. Execute controlled chaos protocol (Wave 9)

Run `npx tsc --noEmit && npx vitest run` after each task.
Commit: `[OPUS:integration] Phase 3 Seq N: description`
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
Continue until all tasks show PASS or are BLOCKED.
```
