# Agent Empire — Complete Build Inventory

**154 source files** across 18 modules · **406 tests** across 48 test files · **All passing**

---

## 🏗️ Foundation Layer (`src/shared/`)

| File | Purpose |
|------|---------|
| `types.ts` | **590 lines** — All core types: `AgentHandle`, `TaskSpec`, `Budget`, `EvalResult`, `BusinessUnit`, `SystemEvent`, `HitlApproval`, `McpEndpoint`, `KnowledgeEntry`, `ModelTier`, `Capability`, `AgentRole` + 30+ supporting types |
| `config.ts` | Zod-validated app config from environment variables (port, DB, Redis, API keys, thresholds) |
| `logger.ts` | Pino-based structured logging with child logger factory |

---

## 🏭 Agent Factory (`src/factory/`) — 18 tests

| File | Purpose |
|------|---------|
| `IAgentFactory.ts` | Interface: `FactoryResult`, `FactoryError`, `FactoryErrorCode`, `AgentFilter` |
| `validation.ts` | Validation rules: privilege escalation prevention, budget cascading, max depth enforcement |
| `AgentFactory.ts` | Creates, lists, filters, terminates agents. SHA-256 provenance hashing. Never throws — returns structured `FactoryResult` |

---

## 💰 Budget Governor (`src/governor/`) — 13 tests

| File | Purpose |
|------|---------|
| `IBudgetGovernor.ts` | Interface: `allocate`, `recordUsage`, `checkBudget`, `getBudget` |
| `BudgetGovernor.ts` | File-backed persistent state, configurable warning/trip thresholds, circuit-breaker event emission, immutable budget override enforcement |

---

## 🔧 Mechanic (`src/mechanic/`) — 14 tests

| File | Purpose |
|------|---------|
| `IMechanic.ts` | Interface for business unit provisioning |
| `DockerProvisioner.ts` | Container lifecycle via Dockerode API |
| `DatabaseProvisioner.ts` | PostgreSQL database provisioning |
| `RepoProvisioner.ts` | GitHub repo creation via Octokit |
| `Mechanic.ts` | Orchestrates all 3 provisioners for end-to-end business unit setup |

---

## ✅ Evaluation Engine (`src/eval/`) — 17 tests

| File | Purpose |
|------|---------|
| `IEvaluator.ts` | Interface: `EvalInput`, `EvalStage`, `PipelineResult` |
| `DeterministicEvaluator.ts` | Pure-code checks (no LLM) — schema validation, format checks |
| `LlmCriticEvaluator.ts` | LLM-powered quality evaluation with injectable provider |
| `EscalationEvaluator.ts` | Frontier-tier escalation to human-in-the-loop |
| `EvalPipeline.ts` | Staged pipeline: Deterministic → LLM Critic → Escalation → HITL |

---

## 🧠 Orchestrator / Jarvis (`src/orchestrator/`) — 50 tests

| File | Purpose |
|------|---------|
| `IJarvis.ts` | Interfaces: `GoalAnalyzer`, `TaskExecutor`, `ClarificationRequest`, `Resolution` |
| `TaskDAG.ts` | DAG data structures: `DAGNode`, validation, topological sort, ready-node detection |
| `systemPrompt.ts` | Completeness matrix (10 fields), clarification threshold, system prompt |
| `A2AProtocol.ts` | Agent-to-Agent messaging: 9 typed message payloads with envelope factory |
| `Jarvis.ts` | **The brain** — goal analysis → DAG decomposition → parallel wave execution → failure cascading → escalation handling |
| `LlmGoalAnalyzer.ts` | Real `GoalAnalyzer` — LLM-backed with zod validation, graceful fallback, JSON extraction |
| `WorkerTaskExecutor.ts` | Real `TaskExecutor` — routes DAG nodes to workers by role, runs eval pipeline, records budget |
| `AnthropicProvider.ts` | Fetch-based Anthropic Messages API provider (no SDK dependency) |

---

## 👷 Workers (`src/workers/`) — 45 tests

| Worker | Capabilities |
|--------|-------------|
| `IWorker.ts` | Interface: `execute(spec) → WorkerResult` |
| `ApiCaller.ts` | HTTP API integration (GET/POST/PUT/DELETE) |
| `ContentFormatter.ts` | Format conversion (markdown, HTML, JSON, YAML) |
| `DataScraper.ts` | Web scraping and data extraction |
| `DataTransformer.ts` | Data transformation pipelines |
| `GitCommitter.ts` | Git operations (stage, commit, push) |
| `NotificationSender.ts` | Multi-channel notifications (email, Slack, webhook) |
| `SchemaValidator.ts` | JSON Schema validation |
| `Summarizer.ts` | Text summarization |
| `ResearchWorker.ts` | First real worker that calls an LLM for research/strategy tasks |

---

## 📚 Librarian (`src/librarian/`) — 10 tests

| File | Purpose |
|------|---------|
| `ILibrarian.ts` | Interface: `ingest`, `query`, `prune`, `resolve` |
| `Librarian.ts` | Knowledge management with dedup (exact + vector similarity), TTL management, conflict resolution. pgvector-oriented store contract |

---

## 🧩 Tool Primitives (`src/primitives/`) — 39 tests

| Primitive | Purpose |
|-----------|---------|
| `LeadTracker/` | Lead management: schema, MCP endpoints, CRUD operations |
| `ApiGateway/` | API gateway management: routing, auth, rate limiting schemas |
| `WebhookManager/` | Webhook lifecycle: registration, delivery, retry tracking |
| `ContentScheduler/` | Content publishing: scheduling, status tracking |
| `AnalyticsCollector/` | Metrics collection: event tracking, aggregation |
| `db.ts` | Shared `QueryChain<T>` and `PrimitiveDb` interfaces (DRY refactor) |

---

## 🖥️ Dashboard (`src/dashboard/`) — Next.js 14 App Router

| Area | Files |
|------|-------|
| **Pages** | `layout.tsx` (root layout), `page.tsx` (main dashboard), `agents/page.tsx`, `businesses/page.tsx` |
| **Components** | `AgentStatusCard`, `BudgetVisualization` (Recharts), `BusinessMetricsPanel`, `ChatInterface`, `EventFeed`, `HitlApprovalQueue`, `TaskDAGViewer`, `ErrorBoundary` |
| **State** | `agentStore.ts` (Zustand), `eventStore.ts` (Zustand + WebSocket) |
| **API** | `proxy/[...path]/route.ts` — backend API proxy |

---

## 🌐 Server (`src/server/`) — 11 tests

| File | Purpose |
|------|---------|
| `createApp.ts` | Hono app factory |
| `container.ts` | Dependency injection container — wires all components together |
| `routes.ts` | API routes: `/health`, `/api/goals`, `/api/agents`, `/api/budget`, `/api/mechanic`, `/metrics`, `/api/knowledge` |
| `middleware.ts` | CORS + request logging + rate limiting (in-memory, env-configurable) |
| `stubs.ts` | Stub `GoalAnalyzer` and `TaskExecutor` for dev/test boot |
| `smoke.test.ts` | 7 E2E tests verifying full API lifecycle |
| `middleware.test.ts` | 4 rate limiter tests |

---

## 🔌 Integration (`src/integration/`) — 10 tests

| File | Purpose |
|------|---------|
| `integration.test.ts` | 8 end-to-end flows: agent lifecycle, child budgets, business provisioning, goal→DAG→execute, clarification protocol, escalation handling, A2A protocol, full pipeline |

---

## 📝 Entry Point (`src/index.ts`)

Auto-detects `ANTHROPIC_API_KEY`:
- **With key** → Real `LlmGoalAnalyzer` + `WorkerTaskExecutor` + `ResearchWorker`
- **Without key** → Stub mode (warning log, no LLM calls)

---

## 🚀 Phase 2 Completions (Runtime, Durability & Minions)

### ⏱️ Runtime & Checkpointing (`src/runtime/`) — 28 tests

| File | Purpose |
|------|---------|
| `scheduler/WaitConditionScheduler.ts` | Resolves time delays, external events, and rate-limit waits; persists waits through checkpoints. |
| `checkpoints/PostgresCheckpointStore.ts` | Full CRUD operations for persistence to Postgres. |
| `checkpoints/RedisCheckpointStore.ts` | High-speed cache serialization with TTL expiration. |
| `checkpoints/WorkflowResumer.ts` | Rehydrates `DispatcherState`, validates envelope consistency, triggers retry-pending nodes. |

---

### 🧠 Orchestrator Extensions (`src/orchestrator/`) — 12 tests

| File | Purpose |
|------|---------|
| `DispatcherMinion.ts` | Deterministic scheduling, retry handling, hibernation, typed trigger escalations. |
| `DispatcherPlanRunner.ts` | Decoupled execution loop logic for the dispatcher. |

---

### �️ Telemetry & Safety Minions (`src/minions/`) — 36 tests

| File | Purpose |
|------|---------|
| `TelemetryMinion.ts` | Tracking token burn rates, spike detection, and sustained high burn alerts. |
| `TokenBurnAnalyzer.ts` | Deterministic budget override analysis based historical usage percentiles. |
| `AuditMinion.ts` | High-priority structural validation and approval checks. |
| `SecretLeakScanner.ts` | Hardcoded pattern mapping to prevent API key and PII leaks. |
| `SchemaConformanceChecker.ts` | Real-time payload strict verification against target definitions. |

---

### 🛠️ Dynamic Tools & Manifests (`src/tools/` & `src/librarian/`) — 8 tests

| File | Purpose |
|------|---------|
| `ToolDiscoveryService.ts` | Fetches active APIs and local components for runtime binding. |
| `DomainToolRegistry.ts` | Maps specific categories for business endpoints to LLM tooling arrays. |
| `InternalRegistry.ts` | Manifest mapping for internal enterprise indexing. |
| `CapabilityManifestWriter.ts` | Standardized documentation proposal system for new capabilities. |

---

### 🔧 Mechanic Safety (`src/mechanic/`) — 10+ tests

| File | Purpose |
|------|---------|
| `ActionPolicy.ts` | Whitelisting and action blocking for infra operations. |
| `MechanicRequestValidator.ts` | Deep Zod validation on incoming Mechanic payloads. |
| `MechanicAuditLog.ts` | Auditing for action compliance tracing. |
| `MechanicActionExecutor.ts` | Typed payload execution isolation and safety grounding. |
| `MechanicStateStore.ts` | Action history for deduplication and status mapping. |

---

## �📦 Infrastructure Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies: Hono, BullMQ, Dockerode, Drizzle, ioredis, Next.js, Pino, Zod, Recharts |
| `tsconfig.json` | Path aliases: `@shared`, `@factory`, `@governor`, `@mechanic`, `@eval`, `@orchestrator`, `@librarian`, `@workers` |
| `vitest.config.ts` | Test configuration with path alias support |
| `Dockerfile` | Production container build |
| `docker-compose.yml` | PostgreSQL + Redis |
| `AGENTS.md` | Multi-agent coordination protocol (26KB) |
| `MEMORY.md` | Session history and architectural decisions |

---

## Test Summary

| Module | Tests |
|--------|-------|
| Factory | 18 |
| Governor | 13 |
| Mechanic | 24 |
| Eval Pipeline | 17 |
| Jarvis Orchestrator | 37 |
| LlmGoalAnalyzer | 14 |
| WorkerTaskExecutor | 11 |
| Workers (8 templates) | 45 |
| Primitives (5 tools) | 39 |
| Librarian | 10 |
| Integration | 10 |
| Server (smoke + middleware) | 11 |
| Runtime & Checkpoints | 28 |
| Safety Minions | 36 |
| Tools & Manifests | 8 |
| **Total** | **406** |
