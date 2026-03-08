# Agent Empire

Recursive agent orchestration system for autonomous digital businesses.

## Quick Start

```bash
git clone https://github.com/bdredz/agent-empire
cd agent-empire
npm install
cp .env.example .env
npm run dev
npm test
```

## Project Structure

```
src/
├── shared/        — Core types (single source of truth)
├── factory/       — Agent provisioning with hard guarantees
├── governor/      — Budget enforcement (infrastructure-level)
├── eval/          — Staged evaluation pipeline
├── mechanic/      — Infrastructure provisioning (Docker, DB, Git)
├── orchestrator/  — Jarvis goal decomposition and task DAG execution
├── librarian/     — Knowledge management with dedup and TTL
├── workers/       — 8 single-purpose task agents
├── primitives/    — 5 reusable business tool modules
├── dashboard/     — Next.js 14 monitoring UI
├── server/        — Hono API server, routes, DI container
└── integration/   — End-to-end test suite
```

## Available Scripts

| Script              | Description                        |
|---------------------|------------------------------------|
| `npm run dev`       | Start development server           |
| `npm run build`     | Production build                   |
| `npm run start`     | Start production server            |
| `npm test`          | Run full test suite                |
| `npm run typecheck` | TypeScript type checking           |
| `npm run lint`      | ESLint source check                |

## Agent Roles

| Agent        | Role            | Description                                              |
|--------------|-----------------|----------------------------------------------------------|
| Jarvis       | Orchestrator    | Receives goals, decomposes into TaskDAGs, delegates      |
| Factory      | Provisioning    | Creates agents with bounded resources and auditable lineage |
| Governor     | Budget          | Infrastructure-level cost enforcement and circuit breaking |
| Mechanic     | Infrastructure  | Docker, database, and repo provisioning                  |
| EvalPipeline | Quality         | Staged deterministic + LLM + escalation evaluation       |
| Librarian    | Knowledge       | Dedup, conflict resolution, TTL, provenance tracking     |
| Workers      | Execution       | 8 single-purpose micro-task agents                       |

## Tech Stack

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

## Architecture

Jarvis receives natural-language goals and decomposes them into a TaskDAG before any execution begins. Each node in the DAG is delegated to a specialized Worker or sub-agent; the EvalPipeline gates quality at every step through deterministic checks, LLM critique, and escalation. The Governor enforces cost budgets at infrastructure level — agents cannot override their own limits. All agents are created through the Factory with immutable lineage, capabilities, and budget bounds. Infrastructure is provisioned by the Mechanic via typed API clients with no raw shell access.

## License

MIT
