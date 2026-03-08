# PRODUCTION-PLAN-GEMINI.md — Production Hardening Tasks for Gemini

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
- No `any`. No `@ts-ignore`. No `as any`.
- Commit after each task
- Run `npx tsc --noEmit && npx vitest run` after each task to verify no regressions
- Keep README under 150 lines. No emojis. No ASCII art.

---

## YOUR ASSIGNED TASKS

### Task 5: README.md (Wave 1)

**No dependencies. Start immediately.**

**Files:**
- Create: `README.md`

**Step 1: Write README with these sections (in order):**

1. **Title** — `# Agent Empire` + one-line description: "Recursive agent orchestration system for autonomous digital businesses."
2. **Quick Start** — clone, `npm install`, `cp .env.example .env`, `npm run dev`, `npm test`
3. **Project Structure** — directory tree (one line per directory under `src/`):
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
4. **Available Scripts** — table with `npm run dev`, `build`, `start`, `test`, `typecheck`, `lint`
5. **Agent Roles** — table: Jarvis (Orchestrator), Factory (Provisioning), Governor (Budget), Mechanic (Infrastructure), EvalPipeline (Quality), Librarian (Knowledge), Workers (Execution)
6. **Tech Stack** — locked list from AGENTS.md Section 1.2 (copy verbatim)
7. **Architecture** — 2-3 sentences: Jarvis receives goals → decomposes into TaskDAG → delegates to Workers → EvalPipeline gates quality → Governor enforces budget. All agents created via Factory. Infrastructure provisioned via Mechanic.
8. **License** — `MIT` (placeholder)

**Keep under 150 lines total.**

**Step 2: Commit**
```bash
git add README.md
git commit -m "docs: add README with quickstart and architecture overview"
```

---

### Task 7: Dashboard Build Fix (Wave 2)

**Depends on: Task 1 (build system) complete — built by CODEX.**

**Files:**
- Create: `src/dashboard/next.config.mjs`

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

**Step 2: Verify file placement is correct**

The Next.js app root is `src/dashboard/` (that's where `app/` directory lives).
Confirm `src/dashboard/app/layout.tsx` exists.

**Step 3: Commit**
```bash
git add src/dashboard/next.config.mjs
git commit -m "fix: add next.config.mjs for dashboard production build"
```

---

### Task 15: Dashboard Error Boundaries (Wave 4)

**Depends on: Task 7 complete.**

**Files:**
- Create: `src/dashboard/components/ErrorBoundary.tsx`
- Modify: `src/dashboard/app/layout.tsx` — wrap children

**Step 1: Create `src/dashboard/components/ErrorBoundary.tsx`**

```tsx
'use client'

import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  readonly children: ReactNode
  readonly fallback?: ReactNode
}

interface ErrorBoundaryState {
  readonly hasError: boolean
  readonly error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-4">{this.state.error?.message}</p>
          <button
            className="px-4 py-2 bg-gray-800 text-white rounded text-sm hover:bg-gray-700"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

**Step 2: Wrap children in `src/dashboard/app/layout.tsx`**

Read the existing `layout.tsx` first. Then add:
- Import: `import { ErrorBoundary } from '../components/ErrorBoundary'`
- Wrap `{children}` with `<ErrorBoundary>{children}</ErrorBoundary>`

Do NOT change anything else in the layout.

**Step 3: Run `npx tsc --noEmit` to verify**

**Step 4: Commit**
```bash
git add src/dashboard/components/ErrorBoundary.tsx src/dashboard/app/layout.tsx
git commit -m "fix: add React error boundary to dashboard layout"
```

---

## EXECUTION ORDER

```
Wave 1: T5 (README) — start immediately
Wave 2: T7 (next.config) — after CODEX T1 is done
Wave 4: T15 (error boundaries) — after T7
```

## COMPLETION SIGNAL

When all your tasks are done:
```
PRODUCTION HARDENING — GEMINI TASKS COMPLETE
Tasks passed: T5, T7, T15
Typecheck: PASS
Tests: PASS (no regressions)
```
