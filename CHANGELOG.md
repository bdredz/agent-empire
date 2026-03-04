# CHANGELOG — Agent Empire Build Log

All coding agents append to this file after completing each phase.
Format is strict — follow exactly.

---

## Format

```
### [DATE] [AGENT] — Phase N: [Phase Name]
**Branch:** agent/[agent]/[component]
**Status:** PASS | BLOCKED:[reason]
**Interfaces consumed:** [list of interfaces imported]
**Interfaces produced:** [list of interfaces exported]
**Files created:** [count]
**Tests:** [passing]/[total]
**Notes:** [any integration concerns or decisions made]
```

---

## Log

### 2026-03-04 OPUS — Phase 0: Scaffold & Types
**Branch:** main
**Status:** PASS
**Interfaces consumed:** none
**Interfaces produced:** All core types (AgentHandle, TaskSpec, CreateAgentRequest, Budget, EvalResult, BusinessUnit, SystemEvent, HitlApproval, McpEndpoint, KnowledgeEntry, + all supporting types)
**Files created:** 7 (types.ts, AGENTS.md, package.json, tsconfig.json, CLAUDE.md, CODEX-ASSIGNMENT.md, GEMINI-ASSIGNMENT.md, OPUS-ASSIGNMENT.md, CHANGELOG.md)
**Tests:** 0/0 (scaffold phase, no tests yet)
**Notes:** Types are frozen. All agents import from src/shared/types.ts. Do not add types without PR review.

### 2026-03-04 CODEX — Phase 2: Budget Governor
**Branch:** agent/codex/budget-governor
**Status:** PASS
**Interfaces consumed:** AgentId, Budget, BudgetUsage, BudgetCheckResult, EventType, SystemEvent, AgentStatus
**Interfaces produced:** IBudgetGovernor, BudgetGovernor
**Files created:** 3 (src/governor/IBudgetGovernor.ts, src/governor/BudgetGovernor.ts, src/governor/BudgetGovernor.test.ts)
**Tests:** 13/13
**Notes:** Added file-backed persistent governor state, configurable warning/trip thresholds via env, and circuit-breaker event emission with immutable budget override enforcement.

### 2026-03-04 CODEX — Phase 4: Mechanic Agent
**Branch:** agent/codex/mechanic
**Status:** PASS
**Interfaces consumed:** ContainerProvisionRequest/Result, DatabaseProvisionRequest/Result, RepoProvisionRequest/Result, BusinessUnit, BusinessStatus, SystemEvent, EventType
**Interfaces produced:** IMechanic, IDockerProvisioner, IDatabaseProvisioner, IRepoProvisioner, DockerProvisioner, DatabaseProvisioner, RepoProvisioner, Mechanic
**Files created:** 6 (src/mechanic/IMechanic.ts, src/mechanic/DockerProvisioner.ts, src/mechanic/DatabaseProvisioner.ts, src/mechanic/RepoProvisioner.ts, src/mechanic/Mechanic.ts, src/mechanic/Mechanic.test.ts)
**Tests:** 14/14
**Notes:** Docker lifecycle implemented via dockerode-only API with no shell/exec, all provisioner inputs validated with Zod, and business provisioning operations logged as SystemEvent entries.

### 2026-03-04 CODEX — Phase 5: Dashboard Scaffold
**Branch:** agent/codex/dashboard
**Status:** PASS
**Interfaces consumed:** AgentHandle, SystemEvent, AgentStatus
**Interfaces produced:** RootLayout, DashboardPage, AgentsPage, BusinessesPage, useAgentStore, useEventStore, proxy route handlers (GET/POST/PUT/DELETE)
**Files created:** 7 (src/dashboard/app/layout.tsx, src/dashboard/app/page.tsx, src/dashboard/app/agents/page.tsx, src/dashboard/app/businesses/page.tsx, src/dashboard/stores/agentStore.ts, src/dashboard/stores/eventStore.ts, src/dashboard/app/api/proxy/[...path]/route.ts)
**Tests:** 0/0
**Notes:** Added Next.js app-router scaffold, backend API proxy route, Zustand-based agent/event stores, and websocket event subscription for real-time dashboard updates.

### 2026-03-04 CODEX — Phase 6: Librarian Agent
**Branch:** agent/codex/librarian
**Status:** PASS
**Interfaces consumed:** KnowledgeEntry, ArtifactId, BusinessId
**Interfaces produced:** ILibrarian, QueryFilters, IngestResult, PruneResult, ResolutionResult, Librarian, ILibrarianStore
**Files created:** 3 (src/librarian/ILibrarian.ts, src/librarian/Librarian.ts, src/librarian/Librarian.test.ts)
**Tests:** 10/10
**Notes:** Added dedup (exact + vector similarity contract), TTL defaulting via env vars, query/prune/conflict-resolution flows, and pgvector-oriented store contract through `searchByVector`.

### 2026-03-04 CODEX — Phase 9: Tool Primitives (LeadTracker, ApiGateway, WebhookManager)
**Branch:** agent/codex/tool-primitives
**Status:** PASS
**Interfaces consumed:** McpEndpoint
**Interfaces produced:** LeadTracker schema/endpoints/ops, ApiGateway schema/endpoints/ops, WebhookManager schema/endpoints/ops
**Files created:** 12 (LeadTracker/{schema.ts,endpoints.ts,operations.ts,LeadTracker.test.ts}, ApiGateway/{schema.ts,endpoints.ts,operations.ts,ApiGateway.test.ts}, WebhookManager/{schema.ts,endpoints.ts,operations.ts,WebhookManager.test.ts})
**Tests:** 28/28
**Notes:** Completed Codex primitive subset with schema + MCP endpoint contracts + tested operations; primitive suite now validates with ContentScheduler and AnalyticsCollector modules.

### 2026-03-04 OPUS — Phase 1: Agent Factory
**Branch:** agent/opus/factory
**Status:** PASS
**Interfaces consumed:** AgentHandle, AgentId, AgentRole, AgentStatus, CreateAgentRequest, Budget, ToolBundle, MemoryPolicy, AgentLineage, Capability, ToolScope, SandboxNetwork, MemoryMode, ChildBudgetPolicy, ModelTier
**Interfaces produced:** IAgentFactory, FactoryResult, FactorySuccess, FactoryError, FactoryErrorCode, TerminationReceipt, AgentFilter, AgentFactory
**Files created:** 4 (src/factory/IAgentFactory.ts, src/factory/validation.ts, src/factory/AgentFactory.ts, src/factory/AgentFactory.test.ts)
**Tests:** 18/18
**Notes:** Hard guarantees enforced: privilege escalation prevention (tool subset), budget cascading, max depth from root, immutable lineage, deterministic provenance hash (SHA-256). All validation returns structured FactoryResult, never throws.

### 2026-03-04 GEMINI — Phase 8: Worker Templates
**Branch:** agent/gemini/worker-templates
**Status:** PASS
**Interfaces consumed:** TaskSpec, ModelTier, Capability
**Interfaces produced:** IWorker, WorkerResult
**Files created:** 17
**Tests:** 45/45
**Notes:** Implemented and tested all 8 requested single-purpose workers.

### 2026-03-04 OPUS — Phase 3: Evaluation Engine
**Branch:** agent/opus/evaluation-engine
**Status:** PASS
**Interfaces consumed:** EvalResult, EvalOutcome, ArtifactId, ModelTier
**Interfaces produced:** IEvaluator, EvalInput, EvalPipelineConfig, EvalStage, PipelineResult, DeterministicEvaluator, DeterministicCheck, SchemaCheck, LlmCriticEvaluator, LlmCriticProvider, EscalationEvaluator, EscalationProvider, EvalPipeline
**Files created:** 6 (src/eval/IEvaluator.ts, src/eval/DeterministicEvaluator.ts, src/eval/LlmCriticEvaluator.ts, src/eval/EscalationEvaluator.ts, src/eval/EvalPipeline.ts, src/eval/EvalPipeline.test.ts)
**Tests:** 17/17
**Notes:** Staged pipeline: Deterministic (pure code, no LLM) → LlmCritic (Fast tier, injectable provider) → Escalation (Frontier tier, injectable provider) → HITL. All providers are dependency-injected for testability. Deterministic evaluator retries on partial failure. Critic retries up to maxCriticFailures (default 3) before escalation. Escalation can recommend HITL. All error paths caught and produce structured EvalResult.

### 2026-03-04 GEMINI — Phase 9 (partial): Tool Primitives
**Branch:** agent/gemini/tool-primitives
**Status:** PASS (for GEMINI portion)
**Interfaces consumed:** McpEndpoint
**Interfaces produced:** Database schemas, MCP endpoint definitions, operations
**Files created:** 8
**Tests:** 11/11
**Notes:** Implemented ContentScheduler and AnalyticsCollector primitives. Waiting on CODEX to finish Phase 9.
