# PRODUCTION-PLAN-CODEX.md — Production Hardening Tasks for Codex

---

## CONTEXT

All 11 build phases are PASS (180/180 tests). This is the production hardening phase.
You are working on branch `prod-hardening`. All agents share this branch.

**MANDATORY READ ORDER:**
1. This file (your tasks)
2. AGENTS.md Sections 0-2 (project rules)
3. `src/shared/types.ts` (type source of truth)
4. `docs/plans/2026-03-06-production-hardening.md` (full plan for reference)

**RULES:**
- Import types ONLY from `src/shared/types.ts`
- Import logger from `src/shared/logger.ts` (created by another agent in Wave 1)
- Import config from `src/shared/config.ts` (created by another agent in Wave 1)
- No `any`. No `@ts-ignore`. No `as any`.
- Commit after each task. Prefix: `build:`, `chore:`, `ci:`, `infra:`, `feat:`
- Run `npx tsc --noEmit && npx vitest run` after each task to verify no regressions

---

## YOUR ASSIGNED TASKS

### Task 1: Build System Fix (Wave 1)

**No dependencies. Start immediately.**

Create `tsconfig.build.json` for compilation. Keep `tsconfig.json` unchanged (noEmit for IDE).

**Files:**
- Create: `tsconfig.build.json`
- Modify: `package.json` (scripts only)

**Step 1: Create `tsconfig.build.json`**

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

**Step 2: Update `package.json` scripts**

Replace the `"scripts"` block with:
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

**Step 3: Verify `dist/` is in `.gitignore`** (it already is — just confirm)

**Step 4: Commit**
```bash
git add tsconfig.build.json package.json
git commit -m "build: add tsconfig.build.json and production build scripts"
```

---

### Task 8: ESLint Config (Wave 2)

**Depends on: Task 1 complete.**

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json` (devDependencies — add `@typescript-eslint/parser`)

**Step 1: Install parser**
```bash
npm install -D @typescript-eslint/parser
```

**Step 2: Create `eslint.config.mjs`**

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
      'no-unused-vars': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'src/dashboard/.next/'],
  },
]
```

**Step 3: Update `package.json` lint script** to:
```json
"lint": "eslint src/"
```
(Remove `--ext .ts,.tsx` — flat config handles it via `files` glob)

**Step 4: Run `npm run lint` — fix any issues**

**Step 5: Commit**
```bash
git add eslint.config.mjs package.json package-lock.json
git commit -m "chore: add eslint flat config for typescript"
```

---

### Task 12: Health + Metrics Endpoint (Wave 3)

**Depends on: Task 6 (Hono server) complete — built by OPUS.**

After OPUS creates `src/server/routes.ts`, enhance the `/health` endpoint and add `/metrics`.

**Files:**
- Modify: `src/server/routes.ts`

**Step 1: Replace the `/health` route with:**

```typescript
app.get('/health', (c) => c.json({
  status: 'ok',
  uptime: process.uptime(),
  version: process.env.npm_package_version ?? '0.1.0',
  timestamp: new Date().toISOString(),
  memory: process.memoryUsage(),
}))
```

**Step 2: Add `/metrics` route after `/health`:**

```typescript
app.get('/metrics', async (c) => {
  const agents = await factory.listAgents()
  return c.json({
    agents: { total: agents.length },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  })
})
```

**Step 3: Run `npx tsc --noEmit && npx vitest run`**

**Step 4: Commit**
```bash
git add src/server/routes.ts
git commit -m "feat: add health check and metrics endpoints"
```

---

### Task 13: Docker + Compose (Wave 4)

**Depends on: Task 6 complete.**

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Step 1: Create `Dockerfile`** (multi-stage)

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

**Step 2: Create `docker-compose.yml`**

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

**Step 3: Create `.dockerignore`**

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

### Task 14: CI/CD Pipeline (Wave 4)

**Depends on: Task 6 complete.**

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

**Step 2: Create directory and commit**
```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for typecheck, test, lint, build"
```

---

## EXECUTION ORDER

```
Wave 1: T1 (build system) — start immediately
Wave 2: T8 (eslint) — after T1
Wave 3: T12 (health/metrics) — after OPUS T6 exists
Wave 4: T13 (Docker) + T14 (CI/CD) — after OPUS T6 exists
```

## COMPLETION SIGNAL

When all your tasks are done:
```
PRODUCTION HARDENING — CODEX TASKS COMPLETE
Tasks passed: T1, T8, T12, T13, T14
Typecheck: PASS
Tests: PASS (no regressions)
```
