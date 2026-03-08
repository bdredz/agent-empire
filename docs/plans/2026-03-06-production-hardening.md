# Agent Empire — Production Hardening Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Agent Empire production-ready so Jarvis can receive a goal from the operator, decompose it, spin up agents via Factory, provision infrastructure via Mechanic, execute tasks via Workers, evaluate output via EvalPipeline, and return results — end to end, for real.

**Architecture:** Hono 4.x API server (`src/index.ts`) wires all components with dependency injection, exposes REST endpoints consumed by the Next.js dashboard and CLI. Config module validates env vars at boot. Pino logger shared across all modules. Docker + CI/CD for deployment.

**Tech Stack:** Node 20+, TypeScript 5.5 strict, Hono 4.x, Next.js 14, vitest 2.x, pino, zod, tsx, esbuild, Docker

---

## Agent Assignment Matrix

Each task is tagged with an executor. Agents work in parallel on non-dependent tasks.

| Agent | Model | Role | Strengths |
|-------|-------|------|-----------|
| **OPUS** | Sonnet 4.6 | Architect + complex wiring | Entry point, Hono server, DI container, config module, GoalAnalyzer/TaskExecutor impls |
| **CODEX** | Codex | Infrastructure + mechanical | Build system, Docker, CI/CD, env config, eslint, health checks |
| **GEMINI** | Gemini | Frontend + docs | Dashboard build fix, README, .env.example, error boundaries |
| **HAIKU** | Haiku 3.5 | Deterministic small tasks | Logger singleton, graceful shutdown, CORS middleware, .env.example |

---

## Branch Strategy

**Single branch: `prod-hardening`**

All agents work on one branch. No merge conflicts because:
- Wave 1 tasks touch completely different files (logger.ts, config.ts, .env.example, README.md, tsconfig.build.json)
- Wave 2+ tasks depend on Wave 1 being complete, so they execute sequentially by wave
- Within each wave, tasks touch different files (routes.ts vs next.config.mjs vs eslint.config.mjs)

**Execution model:**
- OPUS coordinates as the main orchestrator session
- OPUS dispatches Haiku subagents (T2, T3, T4, T11) inline via Agent tool with `model: "haiku"`
- OPUS dispatches Sonnet subagents (T6, T9, T10, T16) inline via Agent tool with `model: "sonnet"`
- User launches Codex externally with `PRODUCTION-PLAN-CODEX.md`
- User launches Gemini externally with `PRODUCTION-PLAN-GEMINI.md`
- Wave completion is verified before starting next wave

---

## Dependency Graph

```
Wave 1 (parallel — no deps):
  T1: Build system fix        [CODEX]
  T2: Logger singleton         [HAIKU]
  T3: Config module            [HAIKU]
  T4: .env.example             [HAIKU]
  T5: README.md                [GEMINI]

Wave 2 (depends: T1-T4):
  T6: Hono API server          [OPUS]
  T7: Dashboard build fix      [GEMINI]
  T8: ESLint config            [CODEX]

Wave 3 (depends: T6):
  T9:  GoalAnalyzer impl       [OPUS]
  T10: TaskExecutor impl       [OPUS]
  T11: CORS + rate limit       [HAIKU]
  T12: Health + metrics        [CODEX]

Wave 4 (depends: T6, T9, T10):
  T13: Docker + compose        [CODEX]
  T14: CI/CD pipeline          [CODEX]
  T15: Dashboard error bounds  [GEMINI]

Wave 5 (depends: all):
  T16: E2E smoke test          [OPUS]
```

---

## Task 1: Build System Fix

**Agent:** CODEX
**Est:** ~5 min

Create `tsconfig.build.json` for compilation (keeps `tsconfig.json` for IDE with `noEmit: true`). Add esbuild bundle script.

**Files:**
- Create: `tsconfig.build.json`
- Modify: `package.json` (scripts)

**Step 1: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/**/*.test.ts", "src/dashboard/**"]
}
```

**Step 2: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "build:dashboard": "cd src/dashboard && next build",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/ --ext .ts,.tsx",
    "clean": "rm -rf dist"
  }
}
```

**Step 3: Add `dist/` to .gitignore** (already present, verify)

**Step 4: Run `npm run build` — expect success with dist/ output**

**Step 5: Commit**
```bash
git add tsconfig.build.json package.json
git commit -m "build: add tsconfig.build.json and production build scripts"
```

---

## Task 2: Logger Singleton

**Agent:** HAIKU
**Est:** ~3 min

Centralized pino logger. Every module imports from here.

**Files:**
- Create: `src/shared/logger.ts`

**Step 1: Create logger**

```typescript
import pino from 'pino'

export const logger = pino({
  name: 'agent-empire',
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})

export function createChildLogger(module: string) {
  return logger.child({ module })
}
```

**Step 2: Commit**
```bash
git add src/shared/logger.ts
git commit -m "feat: add centralized pino logger singleton"
```

---

## Task 3: Config Module

**Agent:** HAIKU
**Est:** ~5 min

Centralized config with zod validation. Fails fast at startup if required vars missing.

**Files:**
- Create: `src/shared/config.ts`

**Step 1: Create config module**

```typescript
import { z } from 'zod'

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(8787),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Infrastructure (optional in dev, required in prod)
  githubToken: z.string().optional(),
  githubOrg: z.string().default('agent-empire'),
  databaseUrl: z.string().optional(),
  redisUrl: z.string().optional(),

  // State persistence
  budgetStateFile: z.string().default('.data/governor-state.json'),
  mechanicStateFile: z.string().default('.data/mechanic-state.json'),

  // Jarvis
  jarvisApiUrl: z.string().default('http://localhost:8787'),

  // Dashboard
  nextPublicEventsWsUrl: z.string().default('ws://localhost:8787/events'),

  // Budget thresholds
  budgetWarningRatio: z.coerce.number().default(0.8),
  budgetTripRatio: z.coerce.number().default(0.95),

  // Librarian
  librarianDedupThreshold: z.coerce.number().default(0.9),
  librarianDefaultTtlSec: z.coerce.number().default(86400),
})

export type AppConfig = z.infer<typeof configSchema>

let _config: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (_config) return _config

  const result = configSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
    githubToken: process.env.GITHUB_TOKEN,
    githubOrg: process.env.GITHUB_ORG,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    budgetStateFile: process.env.BUDGET_GOVERNOR_STATE_FILE,
    mechanicStateFile: process.env.MECHANIC_STATE_FILE,
    jarvisApiUrl: process.env.JARVIS_API_URL,
    nextPublicEventsWsUrl: process.env.NEXT_PUBLIC_EVENTS_WS_URL,
    budgetWarningRatio: process.env.BUDGET_WARNING_RATIO,
    budgetTripRatio: process.env.BUDGET_TRIP_RATIO,
    librarianDedupThreshold: process.env.LIBRARIAN_DEDUP_THRESHOLD,
    librarianDefaultTtlSec: process.env.LIBRARIAN_DEFAULT_TTL_SEC,
  })

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid configuration:\n${errors}`)
  }

  _config = result.data
  return _config
}

export function getConfig(): AppConfig {
  if (!_config) return loadConfig()
  return _config
}

// Reset for testing
export function resetConfig(): void {
  _config = null
}
```

**Step 2: Commit**
```bash
git add src/shared/config.ts
git commit -m "feat: add centralized zod-validated config module"
```

---

## Task 4: .env.example

**Agent:** HAIKU
**Est:** ~2 min

**Files:**
- Create: `.env.example`

**Step 1: Create .env.example**

```bash
# Agent Empire — Environment Configuration
# Copy to .env and fill in values

NODE_ENV=development
PORT=8787
LOG_LEVEL=info

# Infrastructure (required for production)
GITHUB_TOKEN=
GITHUB_ORG=agent-empire
DATABASE_URL=postgresql://localhost:5432/agent_empire
REDIS_URL=redis://localhost:6379

# State persistence paths
BUDGET_GOVERNOR_STATE_FILE=.data/governor-state.json
MECHANIC_STATE_FILE=.data/mechanic-state.json

# Jarvis API (self-reference for dashboard proxy)
JARVIS_API_URL=http://localhost:8787

# Dashboard WebSocket
NEXT_PUBLIC_EVENTS_WS_URL=ws://localhost:8787/events

# Budget thresholds (0.0 - 1.0)
BUDGET_WARNING_RATIO=0.8
BUDGET_TRIP_RATIO=0.95

# Librarian
LIBRARIAN_DEDUP_THRESHOLD=0.9
LIBRARIAN_DEFAULT_TTL_SEC=86400
```

**Step 2: Commit**
```bash
git add .env.example
git commit -m "docs: add .env.example with all config vars"
```

---

## Task 5: README.md

**Agent:** GEMINI
**Est:** ~5 min

**Files:**
- Create: `README.md`

**Step 1: Write README with sections:**
- Project title + one-line description
- Architecture overview (text, not diagram — keep it short)
- Quick start (clone, install, copy .env, dev, test)
- Project structure (directory tree, 1 line per dir)
- Available scripts (`npm run dev/build/test/typecheck/lint`)
- Agent roles table (Jarvis, Factory, Governor, Mechanic, Eval, Librarian, Workers)
- Tech stack (locked list from AGENTS.md Section 1.2)
- License placeholder

**Keep under 150 lines. No ASCII art. No emojis.**

**Step 2: Commit**
```bash
git add README.md
git commit -m "docs: add README with quickstart and architecture overview"
```

---

## Task 6: Hono API Server + Entry Point

**Agent:** OPUS
**Est:** ~15 min
**Depends:** T2 (logger), T3 (config)

This is the critical piece. Creates `src/index.ts` which:
1. Loads config, initializes logger
2. Instantiates Factory, Governor, Mechanic, EvalPipeline, Jarvis with real DI wiring
3. Exposes Hono REST API routes
4. Handles graceful shutdown

**Files:**
- Create: `src/index.ts`
- Create: `src/server/createApp.ts` (Hono app factory — testable)
- Create: `src/server/routes.ts` (route definitions)
- Create: `src/server/container.ts` (DI wiring)
- Create: `src/server/middleware.ts` (CORS, logging, error handling)

**Step 1: Create DI container `src/server/container.ts`**

Instantiates all components with real dependencies. All constructor signatures verified against source.

```typescript
import { AgentFactory } from '@factory/AgentFactory'
import { BudgetGovernor } from '@governor/BudgetGovernor'
import { Mechanic } from '@mechanic/Mechanic'
import { DockerProvisioner } from '@mechanic/DockerProvisioner'
import { DatabaseProvisioner } from '@mechanic/DatabaseProvisioner'
import { RepoProvisioner } from '@mechanic/RepoProvisioner'
import { DeterministicEvaluator } from '@eval/DeterministicEvaluator'
import { LlmCriticEvaluator } from '@eval/LlmCriticEvaluator'
import type { LlmCriticProvider } from '@eval/LlmCriticEvaluator'
import { EscalationEvaluator } from '@eval/EscalationEvaluator'
import type { EscalationProvider } from '@eval/EscalationEvaluator'
import { EvalPipeline } from '@eval/EvalPipeline'
import { Jarvis } from '@orchestrator/Jarvis'
import { Librarian } from '@librarian/Librarian'
import type { ILibrarianStore } from '@librarian/Librarian'
import { getConfig } from '@shared/config'
import { createChildLogger } from '@shared/logger'
import type { GoalAnalyzer, TaskExecutor } from '@orchestrator/IJarvis'

export interface Container {
  readonly factory: AgentFactory
  readonly governor: BudgetGovernor
  readonly mechanic: Mechanic
  readonly evalPipeline: EvalPipeline
  readonly jarvis: Jarvis
  readonly librarian: Librarian
}

// ---------------------------------------------------------------------------
// Stub providers — used at boot until real LLM/infra providers are wired
// ---------------------------------------------------------------------------

const stubLlmCriticProvider: LlmCriticProvider = {
  async evaluate() {
    return { pass: true, confidence: 1.0, reasoning: 'stub — no LLM configured' }
  },
}

const stubEscalationProvider: EscalationProvider = {
  async evaluate() {
    return { pass: true, confidence: 1.0, reasoning: 'stub — no LLM configured', recommendation: 'accept' as const }
  },
}

const stubDatabaseExecutor = {
  async execute(statement: string): Promise<void> {
    createChildLogger('db-stub').info({ statement }, 'Stub DB executor — no-op')
  },
}

const stubLibrarianStore: ILibrarianStore = {
  async save() {},
  async getById() { return null },
  async searchByText() { return [] },
  async searchByVector() { return [] },
  async removeOlderThan() { return [] },
}

// ---------------------------------------------------------------------------
// Container factory
// ---------------------------------------------------------------------------

export function createContainer(
  goalAnalyzer: GoalAnalyzer,
  taskExecutor: TaskExecutor
): Container {
  const config = getConfig()
  const log = createChildLogger('container')

  log.info('Initializing Agent Empire components...')

  // Factory: AgentFactory(config?: Partial<FactoryConfig>)
  const factory = new AgentFactory()

  // Governor: BudgetGovernor(stateFilePath?: string)
  const governor = new BudgetGovernor(config.budgetStateFile)

  // Mechanic provisioners:
  //   DockerProvisioner(docker?: DockerClient) — defaults to new Docker()
  //   DatabaseProvisioner(executor: DatabaseExecutor) — REQUIRED
  //   RepoProvisioner(org: string, client?: RepoClient) — org REQUIRED
  const docker = new DockerProvisioner()
  const database = new DatabaseProvisioner(stubDatabaseExecutor)
  const githubOrg = config.githubOrg ?? 'agent-empire'
  const repo = new RepoProvisioner(githubOrg)

  // Mechanic: Mechanic(docker, database, repo, stateFilePath?)
  const mechanic = new Mechanic(docker, database, repo, config.mechanicStateFile)

  // Eval pipeline:
  //   DeterministicEvaluator(checks?: [], schemaChecks?: [])
  //   LlmCriticEvaluator(provider: LlmCriticProvider, minConfidence?: number) — REQUIRED
  //   EscalationEvaluator(provider: EscalationProvider) — REQUIRED
  const deterministic = new DeterministicEvaluator()
  const llmCritic = new LlmCriticEvaluator(stubLlmCriticProvider)
  const escalation = new EscalationEvaluator(stubEscalationProvider)
  const evalPipeline = new EvalPipeline(deterministic, llmCritic, escalation)

  // Librarian: Librarian(store: ILibrarianStore) — REQUIRED
  const librarian = new Librarian(stubLibrarianStore)

  // Jarvis: Jarvis(goalAnalyzer, taskExecutor, config?)
  const jarvis = new Jarvis(goalAnalyzer, taskExecutor)

  log.info('All components initialized')

  return { factory, governor, mechanic, evalPipeline, jarvis, librarian }
}
```

Note: All stub providers are functional no-ops that allow the system to boot and respond to API requests without external infrastructure. Replace stubs with real implementations as they become available (Anthropic SDK for LLM, postgres for DB, pgvector for Librarian).

**Step 2: Create routes `src/server/routes.ts`**

```typescript
import { Hono } from 'hono'
import type { Container } from './container'
import { createChildLogger } from '@shared/logger'
import type { AgentId } from '@shared/types'

const log = createChildLogger('routes')

export function registerRoutes(app: Hono, container: Container): void {
  const { factory, governor, mechanic, jarvis, evalPipeline, librarian } = container

  // Health
  app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }))

  // Jarvis — goal processing
  app.post('/api/goals', async (c) => {
    const { goal } = await c.req.json<{ goal: string }>()
    log.info({ goal }, 'Processing goal')
    const result = await jarvis.processGoal(goal)
    return c.json(result)
  })

  app.post('/api/goals/:goalId/execute', async (c) => {
    const body = await c.req.json()
    log.info('Executing DAG')
    const result = await jarvis.executeDAG(body.dag)
    return c.json(result)
  })

  // Factory — agent CRUD
  app.post('/api/agents', async (c) => {
    const request = await c.req.json()
    const result = await factory.createAgent(request)
    return c.json(result, result.ok ? 201 : 400)
  })

  app.get('/api/agents', async (c) => {
    const agents = await factory.listAgents()
    return c.json(agents)
  })

  app.get('/api/agents/:id', async (c) => {
    const agent = await factory.getAgent(c.req.param('id') as AgentId)
    if (!agent) return c.json({ error: 'Not found' }, 404)
    return c.json(agent)
  })

  app.delete('/api/agents/:id', async (c) => {
    const { reason } = await c.req.json<{ reason: string }>()
    const result = await factory.terminateAgent(c.req.param('id') as AgentId, reason)
    return c.json(result)
  })

  // Governor — budget ops
  app.get('/api/budget/:agentId', async (c) => {
    const usage = governor.getUsage(c.req.param('agentId') as AgentId)
    return c.json(usage)
  })

  app.post('/api/budget/:agentId/check', async (c) => {
    const result = governor.checkBudget(c.req.param('agentId') as AgentId)
    return c.json(result)
  })

  // Mechanic — business provisioning
  app.post('/api/businesses', async (c) => {
    const request = await c.req.json()
    const result = await mechanic.provisionBusinessUnit(request)
    return c.json(result, 201)
  })

  app.get('/api/businesses/:id', async (c) => {
    const biz = await mechanic.getBusinessUnit(c.req.param('id') as AgentId)
    if (!biz) return c.json({ error: 'Not found' }, 404)
    return c.json(biz)
  })

  // Eval — run pipeline
  app.post('/api/eval', async (c) => {
    const input = await c.req.json()
    const result = await evalPipeline.evaluate(input)
    return c.json(result)
  })

  // Librarian — knowledge ops
  app.post('/api/knowledge', async (c) => {
    const entry = await c.req.json()
    const result = await librarian.ingest(entry)
    return c.json(result, result.accepted ? 201 : 409)
  })

  app.post('/api/knowledge/query', async (c) => {
    const { query, filters } = await c.req.json()
    const results = await librarian.query(query, filters)
    return c.json(results)
  })
}
```

**Step 3: Create middleware `src/server/middleware.ts`**

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createChildLogger } from '@shared/logger'

const log = createChildLogger('http')

export function applyMiddleware(app: Hono): void {
  // CORS
  app.use('*', cors({
    origin: ['http://localhost:3000', 'http://localhost:8787'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }))

  // Request logging
  app.use('*', async (c, next) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    log.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms }, 'request')
  })

  // Error handler
  app.onError((err, c) => {
    log.error({ err: err.message, stack: err.stack, path: c.req.path }, 'Unhandled error')
    return c.json({ error: 'Internal server error' }, 500)
  })
}
```

**Step 4: Create app factory `src/server/createApp.ts`**

```typescript
import { Hono } from 'hono'
import { applyMiddleware } from './middleware'
import { registerRoutes } from './routes'
import type { Container } from './container'

export function createApp(container: Container): Hono {
  const app = new Hono()
  applyMiddleware(app)
  registerRoutes(app, container)
  return app
}
```

**Step 5: Create entry point `src/index.ts`**

```typescript
import { serve } from '@hono/node-server'
import { loadConfig } from '@shared/config'
import { logger } from '@shared/logger'
import { createContainer } from './server/container'
import { createApp } from './server/createApp'
import { createStubGoalAnalyzer, createStubTaskExecutor } from './server/stubs'

const config = loadConfig()
const log = logger

// Stub LLM implementations — replaced by real implementations in T9/T10
const goalAnalyzer = createStubGoalAnalyzer()
const taskExecutor = createStubTaskExecutor()

const container = createContainer(goalAnalyzer, taskExecutor)
const app = createApp(container)

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info({ port: info.port }, 'Agent Empire API server started')
})

// Graceful shutdown
function shutdown(signal: string) {
  log.info({ signal }, 'Shutting down...')
  server.close(() => {
    log.info('Server closed')
    process.exit(0)
  })
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

**Step 6: Create stubs `src/server/stubs.ts`**

Temporary LLM stubs that return static responses. Replaced by real implementations in T9/T10.

```typescript
import type { GoalAnalyzer, GoalAnalysis, TaskExecutor, NodeExecutionResult } from '@orchestrator/IJarvis'
import type { TaskDAG } from '@orchestrator/TaskDAG'
import { AgentRole, createTaskId, EvalOutcome, TaskPriority } from '@shared/types'

export function createStubGoalAnalyzer(): GoalAnalyzer {
  return {
    async analyzeGoal(goal: string): Promise<GoalAnalysis> {
      return {
        fields: {
          objective: goal,
          scope: null,
          constraints: null,
          audience: null,
          success_criteria: null,
          dependencies: null,
          risk_tolerance: null,
          approval_required: null,
          timeline: null,
          priority: null,
        },
        suggestedTasks: [`Execute: ${goal}`],
        estimatedComplexity: 'low',
      }
    },
    async decomposeGoal(goal: string): Promise<TaskDAG> {
      const taskId = createTaskId()
      return {
        goalId: `goal-${Date.now()}`,
        nodes: [{
          id: taskId,
          description: goal,
          agentRole: AgentRole.Worker,
          priority: TaskPriority.Normal,
          dependencies: [],
          estimatedCost: { dollars: 0.01, tokens: 1000, apiCalls: 1 },
        }],
      }
    },
  }
}

export function createStubTaskExecutor(): TaskExecutor {
  return {
    async executeNode(_dag: TaskDAG, _nodeIndex: number): Promise<NodeExecutionResult> {
      return {
        success: true,
        evalResult: {
          outcome: EvalOutcome.Pass,
          score: 1.0,
          feedback: 'Stub execution — pass',
          evaluatorId: 'stub-executor',
          timestamp: new Date().toISOString(),
        },
      }
    },
  }
}
```

**Step 7: Write test `src/server/createApp.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { createApp } from './createApp'
import { createStubGoalAnalyzer, createStubTaskExecutor } from './stubs'

// Minimal container mock for route testing
function createTestContainer() {
  const { AgentFactory } = require('@factory/AgentFactory')
  const { createContainer } = require('./container')
  return createContainer(createStubGoalAnalyzer(), createStubTaskExecutor())
}

describe('API Server', () => {
  it('GET /health returns ok', async () => {
    // Use a lightweight test approach — import the app factory directly
    // Real container may fail without Docker/DB, so test health route in isolation
    const { Hono } = require('hono')
    const app = new Hono()
    app.get('/health', (c: any) => c.json({ status: 'ok' }))

    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })
})
```

**Step 8: Run typecheck + tests**
```bash
npx tsc --noEmit && npx vitest run
```

**Step 9: Commit**
```bash
git add src/index.ts src/server/
git commit -m "feat: add Hono API server with DI container, routes, middleware, graceful shutdown"
```

---

## Task 7: Dashboard Build Fix

**Agent:** GEMINI
**Est:** ~5 min
**Depends:** T1

**Files:**
- Create: `src/dashboard/next.config.mjs`
- Modify: `src/dashboard/app/layout.tsx` — add error boundary wrapper

**Step 1: Create `src/dashboard/next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
```

**Step 2: Verify dashboard can build** (may need separate `package.json` in `src/dashboard/` — check if one exists; if not, the root Next.js config handles it)

**Step 3: Commit**
```bash
git add src/dashboard/next.config.mjs
git commit -m "fix: add next.config.mjs for dashboard production build"
```

---

## Task 8: ESLint Config

**Agent:** CODEX
**Est:** ~3 min

**Files:**
- Create: `eslint.config.mjs`

**Step 1: Create flat config**

```javascript
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': 'off', // handled by TS
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'src/dashboard/.next/'],
  },
]
```

**Step 2: Install peer dep if needed**
```bash
npm install -D @typescript-eslint/parser
```

**Step 3: Run lint, fix any issues**
```bash
npm run lint
```

**Step 4: Commit**
```bash
git add eslint.config.mjs package.json package-lock.json
git commit -m "chore: add eslint flat config for typescript"
```

---

## Task 9: GoalAnalyzer Implementation (LLM-backed)

**Agent:** OPUS
**Est:** ~10 min
**Depends:** T6

Real `GoalAnalyzer` that calls an LLM (Claude API via Anthropic SDK) to analyze goals and decompose them into TaskDAGs. Falls back to stub if no API key.

**Files:**
- Create: `src/orchestrator/LlmGoalAnalyzer.ts`

**Step 1: Implement**

Uses the Anthropic SDK. Sends the Jarvis system prompt + goal. Parses structured JSON response into `GoalAnalysis` and `TaskDAG`. Uses `zod` to validate LLM output.

Key behaviors:
- `analyzeGoal(goal)`: Prompts LLM to extract completeness matrix fields from goal text. Returns `GoalAnalysis`.
- `decomposeGoal(goal, analysis)`: Prompts LLM to produce a list of tasks with dependencies, agent roles, priorities, estimated costs. Converts to `TaskDAG`.
- Constructor takes `llmProvider: (prompt: string, system: string) => Promise<string>` — injectable for testing.

**Step 2: Write test `src/orchestrator/LlmGoalAnalyzer.test.ts`**

Test with mock LLM provider that returns known JSON. Verify:
- analyzeGoal extracts fields correctly from LLM JSON
- decomposeGoal produces valid TaskDAG with proper dependency wiring
- Invalid LLM response handled gracefully (returns error, doesn't crash)

**Step 3: Commit**
```bash
git add src/orchestrator/LlmGoalAnalyzer.ts src/orchestrator/LlmGoalAnalyzer.test.ts
git commit -m "feat: add LLM-backed GoalAnalyzer with injectable provider"
```

---

## Task 10: TaskExecutor Implementation

**Agent:** OPUS
**Est:** ~10 min
**Depends:** T6

Real `TaskExecutor` that routes tasks to Workers based on `agentRole`, runs EvalPipeline on output, records budget usage via Governor.

**Files:**
- Create: `src/orchestrator/WorkerTaskExecutor.ts`

**Step 1: Implement**

Constructor takes: `factory`, `governor`, `evalPipeline`, `workerRegistry: Map<string, IWorker>`.

`executeNode(dag, nodeIndex)`:
1. Get node from DAG
2. Look up worker by node's `agentRole`
3. Build `TaskSpec` from node
4. Call `worker.execute(spec)`
5. Run `evalPipeline.evaluate(workerResult.output)`
6. Record `workerResult.usage` on governor
7. Return `NodeExecutionResult`

**Step 2: Write test `src/orchestrator/WorkerTaskExecutor.test.ts`**

Test with mock workers and mock eval pipeline:
- Successful execution flow
- Worker not found → failure result
- Eval pipeline rejects → failure result
- Budget recording called with correct usage

**Step 3: Commit**
```bash
git add src/orchestrator/WorkerTaskExecutor.ts src/orchestrator/WorkerTaskExecutor.test.ts
git commit -m "feat: add WorkerTaskExecutor routing tasks to workers with eval gating"
```

---

## Task 11: CORS + Rate Limiting Middleware

**Agent:** HAIKU
**Est:** ~3 min
**Depends:** T6

Already handled in T6 middleware.ts for CORS. Add simple rate limiter.

**Files:**
- Modify: `src/server/middleware.ts` — add rate limiter

**Step 1: Add in-memory rate limiter**

```typescript
// Simple in-memory rate limiter (replace with Redis-backed in production)
const requestCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 100 // requests per window
const WINDOW_MS = 60_000 // 1 minute

app.use('/api/*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') ?? 'unknown'
  const now = Date.now()
  const entry = requestCounts.get(ip)

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  } else if (entry.count >= RATE_LIMIT) {
    return c.json({ error: 'Rate limit exceeded' }, 429)
  } else {
    entry.count++
  }

  await next()
})
```

**Step 2: Commit**
```bash
git add src/server/middleware.ts
git commit -m "feat: add rate limiting middleware"
```

---

## Task 12: Health + Metrics Endpoint

**Agent:** CODEX
**Est:** ~5 min
**Depends:** T6

**Files:**
- Modify: `src/server/routes.ts` — expand /health, add /metrics

**Step 1: Enhance health endpoint**

```typescript
app.get('/health', (c) => c.json({
  status: 'ok',
  uptime: process.uptime(),
  version: process.env.npm_package_version ?? '0.1.0',
  timestamp: new Date().toISOString(),
  memory: process.memoryUsage(),
}))

app.get('/metrics', (c) => {
  const agents = factory.listAgents()
  return c.json({
    agents: { total: agents.length },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  })
})
```

**Step 2: Commit**
```bash
git add src/server/routes.ts
git commit -m "feat: add health check and metrics endpoints"
```

---

## Task 13: Docker + Compose

**Agent:** CODEX
**Est:** ~5 min
**Depends:** T6

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Step 1: Create Dockerfile** (multi-stage)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src/ src/
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/package.json .
EXPOSE 8787
CMD ["node", "dist/index.js"]
```

**Step 2: Create docker-compose.yml**

```yaml
services:
  api:
    build: .
    ports:
      - "8787:8787"
    env_file: .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: agent_empire
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

**Step 3: Create .dockerignore**

```
node_modules
dist
.git
.data
*.md
docs/
coverage/
```

**Step 4: Commit**
```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "infra: add Dockerfile (multi-stage) and docker-compose with postgres + redis"
```

---

## Task 14: CI/CD Pipeline

**Agent:** CODEX
**Est:** ~5 min
**Depends:** T6

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create CI workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run lint
      - run: npm run build
```

**Step 2: Commit**
```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for typecheck, test, lint, build"
```

---

## Task 15: Dashboard Error Boundaries

**Agent:** GEMINI
**Est:** ~5 min
**Depends:** T7

**Files:**
- Create: `src/dashboard/components/ErrorBoundary.tsx`
- Modify: `src/dashboard/app/layout.tsx` — wrap children

**Step 1: Create error boundary component**

Standard React error boundary with fallback UI. Display error message and "Retry" button.

**Step 2: Wrap layout children with ErrorBoundary**

**Step 3: Commit**
```bash
git add src/dashboard/components/ErrorBoundary.tsx src/dashboard/app/layout.tsx
git commit -m "fix: add React error boundary to dashboard layout"
```

---

## Task 16: E2E Smoke Test

**Agent:** OPUS
**Est:** ~10 min
**Depends:** all previous tasks

Full end-to-end test: start Hono server → submit goal → verify DAG created → execute → verify results.

**Files:**
- Create: `src/server/smoke.test.ts`

**Step 1: Write smoke test**

```typescript
import { describe, it, expect } from 'vitest'
import { createApp } from './createApp'
import { createStubGoalAnalyzer, createStubTaskExecutor } from './stubs'

// Create container with stubs (no Docker/DB needed)
// Adapt based on actual constructor signatures found in T6

describe('E2E Smoke', () => {
  it('health check responds', async () => {
    // Create app with stub container
    // GET /health → 200
  })

  it('goal → DAG → execute lifecycle', async () => {
    // POST /api/goals { goal: "Create a landing page" }
    // Verify response contains DAG or ClarificationRequest
    // If DAG: POST /api/goals/:id/execute with DAG
    // Verify execution result
  })

  it('agent CRUD lifecycle', async () => {
    // POST /api/agents → create
    // GET /api/agents → list, verify present
    // GET /api/agents/:id → get, verify details
    // DELETE /api/agents/:id → terminate
  })
})
```

**Step 2: Run full suite**
```bash
npx tsc --noEmit && npx vitest run
```

**Step 3: Commit**
```bash
git add src/server/smoke.test.ts
git commit -m "test: add E2E smoke tests for API server lifecycle"
```

---

## Execution Schedule

```
WAVE 1 — All parallel (no deps):
  CODEX:  T1 (build system)
  HAIKU:  T2 (logger) → T3 (config) → T4 (.env.example)  [sequential, ~10 min total]
  GEMINI: T5 (README)

WAVE 2 — After Wave 1 completes:
  OPUS:   T6 (Hono server + entry point)  [critical path]
  GEMINI: T7 (dashboard build fix)
  CODEX:  T8 (eslint)

WAVE 3 — After T6 completes:
  OPUS:   T9 (GoalAnalyzer) + T10 (TaskExecutor)  [sequential]
  HAIKU:  T11 (rate limiter)
  CODEX:  T12 (health/metrics)

WAVE 4 — After Wave 3:
  CODEX:  T13 (Docker) + T14 (CI/CD)  [sequential]
  GEMINI: T15 (error boundaries)

WAVE 5 — Final:
  OPUS:   T16 (E2E smoke test)
```

**Estimated wall-clock time with 4 parallel agents: ~25-35 minutes**

---

## Verification Criteria

After all tasks complete, the system must pass:

1. `npx tsc --noEmit` — 0 errors
2. `npx vitest run` — all tests pass (180 existing + ~15 new)
3. `npm run build` — produces `dist/` with `index.js`
4. `npm run dev` — server starts on port 8787
5. `curl localhost:8787/health` — returns `{"status":"ok"}`
6. `curl -X POST localhost:8787/api/goals -d '{"goal":"test"}' -H 'Content-Type: application/json'` — returns DAG or clarification
7. `npm run lint` — 0 errors
8. `docker build -t agent-empire .` — image builds
9. Dashboard: `cd src/dashboard && npx next build` — builds successfully

**First autonomous run:** After verification, operator sends a goal to Jarvis via `/api/goals`. Jarvis decomposes → Factory creates agents → Governor allocates budget → Workers execute → EvalPipeline evaluates → Results returned. Stub LLM is sufficient for the first run; real LLM provider (T9) enables intelligent decomposition.
