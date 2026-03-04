# AGENTS.md — Agent Empire Build Specification + Autonomous Execution Loop

---

## 0. HOW THIS FILE WORKS

You are an AI coding agent. This file is your operating manual.

**MANDATORY READ ORDER:**
1. Section 0 (this section — how to operate)
2. Section 1 (project definition — what you're building)
3. Section 2 (execution loop — how to run autonomously)
4. Sections 3-9 (rules — how to write code)
5. Section 10 (anti-patterns — what never to do)

**AUTONOMOUS MODE:**
This file contains a phase-by-phase build plan in Section 2.
You execute phases sequentially in a loop. You do NOT stop
between phases to ask for permission. You keep going until
all phases pass or you hit a blocker you cannot resolve.

**CRITICAL CONSTRAINT:**
All types are defined in `src/shared/types.ts`. This is the
SINGLE SOURCE OF TRUTH. Never define types inline. Import from
this file. If a type is missing, add it there first.

**COMPLETION SIGNAL:**
When all assigned phases show PASS, output:
```
BUILD COMPLETE
Agent: [YOUR_AGENT_ID — CODEX | GEMINI | OPUS]
Phases passed: [N]/[N]
Total tests: [count] passing
Typecheck: PASS
```

---

## 1. PROJECT DEFINITION

### 1.1 Summary
The Agent Empire is a recursive agent orchestration system where a
central Orchestrator (Jarvis) commands specialized agents to provision,
run, and scale autonomous digital businesses. The system uses an Agent
Factory for deterministic provisioning, a Budget Governor for cost
enforcement, an Evaluation Engine for quality gating, and isolated
business units with hub-and-spoke data architecture.

### 1.2 Stack (locked — do not deviate)
```
runtime:        node 20+
language:       typescript 5.5+ (strict mode)
framework:      hono 4.x (API) + next.js 14 (dashboard, app router)
state:          zustand 5.x (frontend)
database:       postgresql (via drizzle-orm) + pgvector
cache:          redis (via ioredis)
queue:          bullmq (job scheduling)
container:      dockerode (Docker API client)
git:            octokit (GitHub API client)
secrets:        doppler SDK or infisical SDK
testing:        vitest 2.x + supertest
validation:     zod
styling:        tailwind 3.x (dashboard only)
logging:        pino (structured JSON logs)
key deps:       nanoid (IDs), tsx (dev runner)
```

### 1.3 Architecture invariants
```
1.  ALL types live in src/shared/types.ts — single source of truth
2.  Every API response is typed. No `any`. No `unknown` past boundaries.
3.  Agents NEVER hold production secrets in memory. Secrets fetched
    at runtime via secrets manager SDK, passed as env vars to containers.
4.  Budget enforcement is infrastructure-level (middleware/governor),
    NOT agent-level. Agents cannot override their own limits.
5.  Every agent creation goes through the Factory. No ad-hoc spawning.
6.  Evaluation is deterministic-first, LLM-critic-second, Opus-escalation-last.
7.  Each business unit gets an isolated database (spoke). Dashboard reads
    all spokes via read-only connections (hub).
8.  MCP endpoints are the ONLY way agents interact with infrastructure.
    No raw shell, no eval, no arbitrary command execution.
9.  All inter-agent communication uses structured JSON over typed A2A protocol.
10. HITL approval is MANDATORY for: human-facing comms, financial actions,
    code deployment to production, database schema changes.
```

### 1.4 File conventions
```
components:  PascalCase.tsx
modules:     PascalCase.ts
tests:       colocated as Name.test.ts
styles:      Name.module.css
exports:     named only, no default exports
one primary export per file
max 200 lines per file (excluding tests)
```

### 1.5 Commands
```bash
typecheck:   npx tsc --noEmit
test:        npx vitest run
test:module: npx vitest run src/[path]/
build:       npm run build
dev:         npm run dev
lint:        npx eslint src/
```

### 1.6 Commit Protocol
```
Format: [AGENT:component] Phase N: description
Examples:
  [CODEX:mechanic] Phase 2: Docker provisioning endpoints
  [GEMINI:worker-templates] Phase 1: data scraper template
  [OPUS:factory] Phase 1: core factory with hard guarantees
```

### 1.7 Branch Protocol
```
Format: agent/{agent-name}/{component}
Examples:
  agent/codex/mechanic
  agent/codex/budget-governor
  agent/gemini/worker-scraper
  agent/gemini/dashboard-components
  agent/opus/factory
  agent/opus/evaluation-engine
```

---

## 2. AUTONOMOUS EXECUTION LOOP

### 2.1 The Loop

```
WHILE phases remain:
  phase = next phase where status != PASS
  
  READ phase definition below
  FOR EACH step in phase:
    EXECUTE step
    IF step has a verify command:
      RUN verify command
      IF fail:
        FIX the issue (max 3 attempts)
        IF still failing after 3 attempts:
          LOG the error
          MARK phase as BLOCKED
          CONTINUE to next phase that doesn't depend on this one
  
  RUN phase verify command
  IF pass:
    MARK phase as PASS in status tracker below
    COMMIT: "[AGENT:component] Phase [N]: [name] complete"
  
  IF all phases PASS:
    RUN full verify: typecheck + all tests + build
    OUTPUT completion signal
    STOP
```

### 2.2 Status Tracker

Update this in-place as you complete phases:

```
PHASE 0: SCAFFOLD & TYPES     [PASS]       depends: none        owner: OPUS
PHASE 1: AGENT FACTORY         [PASS]        depends: 0          owner: OPUS
PHASE 2: BUDGET GOVERNOR        [PASS] depends: 0          owner: CODEX
PHASE 3: EVALUATION ENGINE      [PASS]        depends: 0,1        owner: OPUS+CODEX
PHASE 4: MECHANIC AGENT         [PASS] depends: 0,1        owner: CODEX
PHASE 5: DASHBOARD SCAFFOLD     [PASS] depends: 0          owner: CODEX
PHASE 6: LIBRARIAN AGENT        [PASS] depends: 0,1,3      owner: CODEX
PHASE 7: JARVIS ORCHESTRATOR    [NOT_STARTED] depends: 1,2,3,4    owner: OPUS
PHASE 8: WORKER TEMPLATES       [PASS]        depends: 0,1        owner: GEMINI
PHASE 9: TOOL PRIMITIVES        [PASS] depends: 0,4        owner: CODEX+GEMINI
PHASE 10: DASHBOARD COMPONENTS  [PASS]        depends: 5,0        owner: GEMINI
PHASE 11: INTEGRATION           [NOT_STARTED] depends: all        owner: OPUS
```

Valid statuses: NOT_STARTED | IN_PROGRESS | PASS | BLOCKED:[reason]

---

### 2.3 Phase Definitions

#### PHASE 0: SCAFFOLD & TYPES
**Owner:** OPUS (complete)
**Depends on:** none
**Verify:** `npx tsc --noEmit`

This phase is COMPLETE. The shared types file exists at `src/shared/types.ts`.
All subsequent phases import from it.

**Files this phase created:**
- [x] src/shared/types.ts
- [x] AGENTS.md
- [x] package.json
- [x] tsconfig.json

---

#### PHASE 1: AGENT FACTORY
**Owner:** OPUS
**Depends on:** 0
**Verify:** `npx vitest run src/factory/`

The Factory is the deterministic provisioning API. It creates agents with
bounded resources, declared capabilities, and auditable lineage.

**Steps:**
1. **Create `src/factory/AgentFactory.ts`**
   Implements `IAgentFactory` interface:
   - `createAgent(request: CreateAgentRequest): Promise<AgentHandle>`
   - `terminateAgent(agentId: AgentId, reason: string): Promise<TerminationReceipt>`
   - `getAgent(agentId: AgentId): Promise<AgentHandle | null>`
   - `listAgents(filter?: AgentFilter): Promise<AgentHandle[]>`
   
   HARD GUARANTEES to enforce:
   - No child can have higher privileges than parent (tools, memory, budgets)
   - Child budgets sum <= parent remaining budget
   - Max depth from root is globally bounded (configurable, default 5)
   - All agents get immutable lineage {root, parent, depth}
   - Provenance hash computed from request + resolved config
   After creating: `npx tsc --noEmit`

2. **Create `src/factory/AgentFactory.test.ts`**
   Minimum 15 tests:
   - Creates agent with valid request
   - Rejects request with budget exceeding parent
   - Rejects request with tools not in parent's bundle
   - Rejects request exceeding max recursion depth
   - Generates unique agentId per creation
   - Computes deterministic provenance hash
   - Sets correct lineage for root agent (no parent)
   - Sets correct lineage for child agent
   - Terminates agent and returns receipt
   - Rejects termination of already-terminated agent
   - Lists agents with role filter
   - Lists agents with status filter
   - Enforces spawn permission checks
   - Handles concurrent creation safely
   - Rejects disallowed tools
   After creating: `npx vitest run src/factory/`

**Files this phase creates:**
- [ ] src/factory/IAgentFactory.ts
- [ ] src/factory/AgentFactory.ts
- [ ] src/factory/AgentFactory.test.ts
- [ ] src/factory/validation.ts (request validation via Zod)

**Guardrails:**
- Factory does NOT start containers or provision infra (that's the Mechanic)
- Factory produces AgentHandle objects and stores them in memory/DB
- All validation errors return structured error objects, never throw

---

#### PHASE 2: BUDGET GOVERNOR
**Owner:** CODEX
**Depends on:** 0
**Verify:** `npx vitest run src/governor/`

The Budget Governor is pure enforcement infrastructure. It tracks resource
consumption and triggers circuit breakers. It is NOT an agent — it is
middleware/service that agents cannot override.

**Steps:**
1. **Create `src/governor/BudgetGovernor.ts`**
   Implements `IBudgetGovernor` interface:
   - `allocate(agentId: AgentId, budget: Budget): void`
   - `recordUsage(agentId: AgentId, usage: Partial<BudgetUsage>): void`
   - `checkBudget(agentId: AgentId): BudgetCheckResult`
   - `tripCircuitBreaker(agentId: AgentId, reason: string): void`
   - `getUsage(agentId: AgentId): BudgetUsage`
   
   BudgetCheckResult: { withinLimits: boolean, warnings: string[], exceeded: string[] }
   
   Circuit breaker trips when:
   - Token usage > 90% of max (warning at 75%)
   - Tool calls > 90% of max (warning at 75%)
   - Wall time > 90% of max (warning at 75%)
   - Cost units exceed max
   
   When circuit breaker trips:
   - Emit CircuitBreakerTripped event
   - Mark agent as Paused
   - Log full usage details
   After creating: `npx tsc --noEmit`

2. **Create `src/governor/BudgetGovernor.test.ts`**
   Minimum 12 tests:
   - Allocates budget for new agent
   - Records usage increments
   - Returns within-limits when under budget
   - Returns warning at 75% threshold
   - Trips circuit breaker at 90% tokens
   - Trips circuit breaker at 90% tool calls
   - Trips circuit breaker at 90% wall time
   - Emits correct event on circuit breaker
   - Rejects usage recording for unknown agent
   - Handles concurrent usage recording
   - Tracks cumulative usage across multiple recordings
   - Governor cannot be overridden by agent requests
   After creating: `npx vitest run src/governor/`

**Files this phase creates:**
- [ ] src/governor/IBudgetGovernor.ts
- [ ] src/governor/BudgetGovernor.ts
- [ ] src/governor/BudgetGovernor.test.ts

**Guardrails:**
- Governor is stateless per request — reads from persistent store
- No agent can call Governor to increase its own budget
- Budget data persisted to DB, not in-memory only
- All thresholds are configurable via env vars with sensible defaults

---

#### PHASE 3: EVALUATION ENGINE
**Owner:** OPUS (architecture) + CODEX (deterministic checkers)
**Depends on:** 0, 1
**Verify:** `npx vitest run src/eval/`

Staged evaluation pipeline: deterministic first, then LLM critic, then Opus escalation.

**Steps:**
1. **Create `src/eval/IEvaluator.ts`**
   Core interface for all evaluator types.

2. **Create `src/eval/DeterministicEvaluator.ts`**
   Runs schema validation, unit tests, regex checks, linting.
   This is the first gate — cheap, fast, no LLM calls.

3. **Create `src/eval/LlmCriticEvaluator.ts`**
   Uses a Fast-tier model to assess quality, coherence, and compliance.
   Only runs if deterministic evaluation passes.

4. **Create `src/eval/EscalationEvaluator.ts`**
   Routes to Frontier-tier model (Opus) when lower evaluators fail
   repeatedly or when task is flagged as critical.

5. **Create `src/eval/EvalPipeline.ts`**
   Orchestrates the staged pipeline:
   Deterministic → (pass?) → LlmCritic → (pass?) → accept
   Deterministic → (fail?) → retry with feedback
   LlmCritic → (fail 3x?) → Escalation
   Escalation → (fail?) → HITL

6. **Create `src/eval/EvalPipeline.test.ts`**
   Minimum 15 tests covering all pipeline paths.

**Files this phase creates:**
- [ ] src/eval/IEvaluator.ts
- [ ] src/eval/DeterministicEvaluator.ts
- [ ] src/eval/LlmCriticEvaluator.ts
- [ ] src/eval/EscalationEvaluator.ts
- [ ] src/eval/EvalPipeline.ts
- [ ] src/eval/EvalPipeline.test.ts

**Guardrails:**
- Deterministic evaluator uses NO LLM calls — pure code
- LlmCritic uses Fast tier only (Haiku-class)
- Escalation to Opus requires 3 consecutive failures at lower tiers
- Every eval produces structured EvalResult with reasoning

---

#### PHASE 4: MECHANIC AGENT
**Owner:** CODEX
**Depends on:** 0, 1
**Verify:** `npx vitest run src/mechanic/`

The Mechanic provisions infrastructure through strictly defined MCP endpoints.
It implements the Factory's provisioning requests in the physical world.

**Steps:**
1. **Create `src/mechanic/IMechanic.ts`**
   Interface for infrastructure operations.

2. **Create `src/mechanic/DockerProvisioner.ts`**
   Uses dockerode to manage container lifecycle.
   ONLY permitted operations:
   - createContainer(request: ContainerProvisionRequest)
   - startContainer(containerId: string)
   - stopContainer(containerId: string)
   - removeContainer(containerId: string)
   - getContainerStatus(containerId: string)
   NO raw exec. NO shell access. NO arbitrary commands.

3. **Create `src/mechanic/DatabaseProvisioner.ts`**
   Provisions isolated PostgreSQL databases per business unit.

4. **Create `src/mechanic/RepoProvisioner.ts`**
   Uses octokit to create private repos from templates.

5. **Create `src/mechanic/Mechanic.ts`**
   Orchestrates all provisioners. Receives high-level commands
   ("provision business unit") and delegates to specific provisioners.

6. **Tests for all provisioners.**

**Files this phase creates:**
- [ ] src/mechanic/IMechanic.ts
- [ ] src/mechanic/DockerProvisioner.ts
- [ ] src/mechanic/DatabaseProvisioner.ts
- [ ] src/mechanic/RepoProvisioner.ts
- [ ] src/mechanic/Mechanic.ts
- [ ] src/mechanic/Mechanic.test.ts

**Guardrails:**
- All Docker operations go through dockerode typed API, never child_process
- Secrets injected via Doppler SDK reference, never hardcoded
- Every provisioning operation logged as SystemEvent
- Mechanic validates all inputs via Zod before executing

---

#### PHASE 5: DASHBOARD SCAFFOLD
**Owner:** CODEX
**Depends on:** 0
**Verify:** `npm run build`

Basic Next.js app with layout, routing, and API proxy to backend.

**Steps:**
1. Scaffold Next.js 14 app with app router
2. Create layout with sidebar (agent list) and main area
3. Create API routes that proxy to Hono backend
4. Create basic Zustand store for agent state
5. Create WebSocket connection for real-time events

**Files this phase creates:**
- [ ] src/dashboard/app/layout.tsx
- [ ] src/dashboard/app/page.tsx
- [ ] src/dashboard/app/agents/page.tsx
- [ ] src/dashboard/app/businesses/page.tsx
- [ ] src/dashboard/stores/agentStore.ts
- [ ] src/dashboard/stores/eventStore.ts

**Guardrails:**
- Dashboard is READ-ONLY for business data (hub pattern)
- Chat interface sends to Jarvis API, does not run LLM locally
- All state managed via Zustand, no prop drilling

---

#### PHASE 6: LIBRARIAN AGENT
**Owner:** CODEX
**Depends on:** 0, 1, 3
**Verify:** `npx vitest run src/librarian/`

Knowledge hygiene: dedup, conflict resolution, TTL, provenance.

**Steps:**
1. **Create `src/librarian/Librarian.ts`**
   - `ingest(entry: KnowledgeEntry): Promise<IngestResult>`
   - `query(query: string, filters?: QueryFilters): Promise<KnowledgeEntry[]>`
   - `prune(olderThan: string): Promise<PruneResult>`
   - `resolveConflict(entryA: ArtifactId, entryB: ArtifactId): Promise<ResolutionResult>`

2. **Create `src/librarian/Librarian.test.ts`**
   Minimum 10 tests.

**Files this phase creates:**
- [ ] src/librarian/ILibrarian.ts
- [ ] src/librarian/Librarian.ts
- [ ] src/librarian/Librarian.test.ts

---

#### PHASE 7: JARVIS ORCHESTRATOR
**Owner:** OPUS
**Depends on:** 1, 2, 3, 4
**Verify:** `npx vitest run src/orchestrator/`

The brain. Receives goals, constructs task DAGs, delegates to agents.

**Steps:**
1. **Create `src/orchestrator/Jarvis.ts`**
   - `processGoal(goal: string): Promise<TaskDAG>`
   - `executeDAG(dag: TaskDAG): Promise<ExecutionResult>`
   - `handleEscalation(evalResult: EvalResult): Promise<Resolution>`
   - `clarify(goal: string): Promise<ClarificationRequest>`

2. System prompt with personality, clarification protocol, and
   completeness matrix.

3. A2A protocol for structured inter-agent communication.

4. **Tests verifying goal decomposition, DAG construction, delegation.**

**Files this phase creates:**
- [ ] src/orchestrator/IJarvis.ts
- [ ] src/orchestrator/Jarvis.ts
- [ ] src/orchestrator/TaskDAG.ts
- [ ] src/orchestrator/A2AProtocol.ts
- [ ] src/orchestrator/systemPrompt.ts
- [ ] src/orchestrator/Jarvis.test.ts

**Guardrails:**
- Jarvis ONLY delegates. It never executes tasks directly.
- Every goal must produce a TaskDAG before execution begins.
- Clarification protocol fires when completeness matrix < 70% filled.
- Jarvis uses Frontier tier model only.

---

#### PHASE 8: WORKER TEMPLATES
**Owner:** GEMINI
**Depends on:** 0, 1
**Verify:** `npx vitest run src/workers/`

Lightweight, single-purpose agents for micro-tasks.

**Steps:**
Create each worker as a self-contained module implementing IWorker:
1. DataScraper — parses URLs into structured JSON
2. Summarizer — condenses long text into bullet points
3. GitCommitter — writes formatted commit messages and pushes
4. ContentFormatter — transforms content between formats
5. SchemaValidator — validates JSON against schemas
6. ApiCaller — makes structured API requests and parses responses
7. NotificationSender — sends alerts via configured channels
8. DataTransformer — ETL operations on structured data

Each worker: implementation + test file with minimum 5 tests.

**Files this phase creates:**
- [ ] src/workers/IWorker.ts
- [ ] src/workers/DataScraper.ts + test
- [ ] src/workers/Summarizer.ts + test
- [ ] src/workers/GitCommitter.ts + test
- [ ] src/workers/ContentFormatter.ts + test
- [ ] src/workers/SchemaValidator.ts + test
- [ ] src/workers/ApiCaller.ts + test
- [ ] src/workers/NotificationSender.ts + test
- [ ] src/workers/DataTransformer.ts + test

**Guardrails:**
- Each worker has exactly ONE responsibility
- Workers are stateless — they receive a TaskSpec and return artifacts
- Workers use Fast or Tiny model tier only
- No worker can spawn child agents

---

#### PHASE 9: TOOL PRIMITIVES LIBRARY
**Owner:** CODEX + GEMINI
**Depends on:** 0, 4
**Verify:** `npx vitest run src/primitives/`

Pre-fab modules the Mechanic deploys into business containers.

**Steps:**
1. LeadTracker — CRUD for leads with status pipeline
2. ContentScheduler — queue and publish content on schedule
3. ApiGateway — rate-limited proxy for external API calls
4. AnalyticsCollector — event tracking and metric aggregation
5. WebhookManager — register and dispatch webhooks

Each primitive: schema + MCP endpoints + test file.

**Files this phase creates:**
- [ ] src/primitives/LeadTracker/ (schema, endpoints, tests)
- [ ] src/primitives/ContentScheduler/ (schema, endpoints, tests)
- [ ] src/primitives/ApiGateway/ (schema, endpoints, tests)
- [ ] src/primitives/AnalyticsCollector/ (schema, endpoints, tests)
- [ ] src/primitives/WebhookManager/ (schema, endpoints, tests)

---

#### PHASE 10: DASHBOARD COMPONENTS
**Owner:** GEMINI
**Depends on:** 5, 0
**Verify:** `npm run build`

Individual React components for the dashboard.

**Steps:**
1. AgentStatusCard — shows agent role, status, budget usage
2. BusinessMetricsPanel — revenue, costs, failure rate per business
3. ChatInterface — sends messages to Jarvis, displays responses
4. EventFeed — real-time stream of SystemEvents
5. BudgetVisualization — charts showing cost across agents/businesses
6. HitlApprovalQueue — pending approvals with approve/deny actions
7. TaskDAGViewer — visual representation of task graph

Each component: implementation + Tailwind styling.

**Files this phase creates:**
- [ ] src/dashboard/components/AgentStatusCard.tsx
- [ ] src/dashboard/components/BusinessMetricsPanel.tsx
- [ ] src/dashboard/components/ChatInterface.tsx
- [ ] src/dashboard/components/EventFeed.tsx
- [ ] src/dashboard/components/BudgetVisualization.tsx
- [ ] src/dashboard/components/HitlApprovalQueue.tsx
- [ ] src/dashboard/components/TaskDAGViewer.tsx

---

#### PHASE 11: INTEGRATION
**Owner:** OPUS
**Depends on:** all
**Verify:** full test suite + typecheck + build

Wire everything together. End-to-end test: 
"Provision a new agent-only business" flowing through
Jarvis → Factory → Mechanic → Workers → Eval → Dashboard.

---

## 3. TOKEN EFFICIENCY RULES

### 3.1 Diff over rewrite
When modifying an existing file, change ONLY the affected
functions. Do NOT regenerate entire files to change a few lines.

### 3.2 No yapping
Do not explain what you're about to do.
Do not summarize what you just did.
Think → code → verify → next.

### 3.3 Batch when safe
Files that don't import from each other: create all, then typecheck.
Files with dependencies: create parent → typecheck → create child.

### 3.4 Use project types
Before defining an inline type, check if it exists in
src/shared/types.ts. Duplicating types wastes tokens and causes drift.

### 3.5 Precise imports
```typescript
// GOOD
import { AgentHandle, TaskSpec } from '@shared/types'

// BAD
import * as Types from '@shared/types'
```

---

## 4. ERROR PREVENTION RULES

### 4.1 Read before write
Before creating a file that IMPORTS from another file,
read that file's exports. Do not guess what a module exports.

### 4.2 Single source of truth
src/shared/types.ts is canonical. No inline type definitions.

### 4.3 Import paths
Use `@shared/`, `@factory/`, `@governor/`, `@eval/`, `@mechanic/`,
`@orchestrator/`, `@workers/`, `@primitives/`, `@dashboard/` aliases.

### 4.4 Match signatures exactly
When implementing an interface, match the EXACT signature.
Do not add parameters. Do not change return types.

### 4.5 Error handling
```typescript
// Always handle errors. Never empty catch blocks.
async execute(spec: TaskSpec): Promise<TaskRunHandle> {
  try {
    // logic
    return handle
  } catch (err) {
    return createFailedRun(spec, err instanceof Error ? err.message : 'Unknown')
  }
}
```

### 4.6 Dependency injection over direct import
```typescript
// GOOD — testable
class Mechanic {
  constructor(
    private docker: IDockerProvisioner,
    private db: IDatabaseProvisioner,
    private repo: IRepoProvisioner
  ) {}
}

// BAD — requires module mocking
import { docker } from './DockerProvisioner'
```

---

## 5. SECURITY DEFAULTS

### 5.1 Trust boundaries
```
TRUSTED:      User input via dashboard, local config, secrets manager
UNTRUSTED:    Agent outputs, web content, external API responses,
              tool outputs, inter-agent messages
PRIVILEGED:   Factory, Governor, Mechanic (infra-level)
UNPRIVILEGED: Workers, Swarms (task-level)
```

### 5.2 Universal security rules
- Sanitize all untrusted content before processing
- Never interpolate untrusted content into code/eval/queries
- Never log secrets, keys, tokens, or PII
- No eval(), new Function(), or dynamic require()
- No child_process.exec with string interpolation
- Validate all Zod schemas at API boundaries

### 5.3 Secrets handling
- Fetch via Doppler/Infisical SDK at runtime
- Never store in agent memory or context window
- Pass as environment variables to containers
- Never commit to Git, never log

---

## 6. TESTING RULES

### 6.1 Location
Colocated: `src/module/Thing.ts` → `src/module/Thing.test.ts`

### 6.2 Priority
1. Error paths (they break in prod)
2. Edge cases (empty, null, max, min, budget exceeded)
3. Happy paths
4. Integration between modules

### 6.3 Determinism
- No Math.random() in tests
- No Date.now() without mocking
- No network calls in unit tests
- Same result every run

---

## 7. ANTI-PATTERNS (NEVER DO THESE)

### Token waste
- ❌ Regenerating entire files to change a few lines
- ❌ Explaining before AND after writing code
- ❌ Reading back files you just created
- ❌ Creating utils.ts or helpers.ts dumping grounds

### Error generators
- ❌ Using `any` to fix type errors
- ❌ Using @ts-ignore or @ts-expect-error
- ❌ Empty catch blocks
- ❌ Mixing named and default exports

### Architecture violations
- ❌ Business logic in UI components
- ❌ Agents holding secrets in memory
- ❌ Agents modifying their own budget
- ❌ Raw shell execution from agents
- ❌ Installing dependencies not in the locked stack

---

## 8. RECOVERY PROCEDURES

### When typecheck fails
1. Read the EXACT error message
2. Check if the type exists in src/shared/types.ts
3. Fix the source file, not the type definition (unless type is wrong)
4. Max 3 fix attempts per error, then mark phase BLOCKED

### When tests fail
1. Read the failure message and stack trace
2. Fix the SOURCE CODE to match the spec
3. Only fix the TEST if the test contradicts the spec
4. Max 3 fix attempts per test, then mark phase BLOCKED

### When stuck (BLOCKED)
Output:
```
PHASE [N] BLOCKED
Agent: [YOUR_AGENT_ID]
Reason: [specific error that persists after 3 fix attempts]
Files affected: [list]
Attempted fixes: [brief list]
```
Then continue to the next phase that doesn't depend on this one.

---

## 9. FINAL VERIFICATION CHECKLIST

After all assigned phases show PASS:

```bash
npx tsc --noEmit
npx vitest run
npm run build
grep -r ": any" src/ --include="*.ts" --include="*.tsx"    # expect 0
grep -r "@ts-ignore" src/                                   # expect 0
```

All commands must exit 0 or return 0 results.
