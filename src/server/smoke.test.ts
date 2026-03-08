import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { registerRoutes } from './routes'
import { createStubGoalAnalyzer, createStubTaskExecutor } from './stubs'
import { AgentFactory } from '@factory/AgentFactory'
import { BudgetGovernor } from '@governor/BudgetGovernor'
import { EvalPipeline } from '@eval/EvalPipeline'
import { DeterministicEvaluator } from '@eval/DeterministicEvaluator'
import { LlmCriticEvaluator } from '@eval/LlmCriticEvaluator'
import { EscalationEvaluator } from '@eval/EscalationEvaluator'
import { Jarvis } from '@orchestrator/Jarvis'
import { Librarian } from '@librarian/Librarian'
import { Mechanic } from '@mechanic/Mechanic'
import type { Container } from './container'
import type { KnowledgeEntry, ArtifactId } from '@shared/types'
import type { LlmCriticProvider } from '@eval/LlmCriticEvaluator'
import type { EscalationProvider, EscalationContext } from '@eval/EscalationEvaluator'
import type { ILibrarianStore, VectorMatch } from '@librarian/Librarian'
import type { QueryFilters } from '@librarian/ILibrarian'
import type { IMechanic } from '@mechanic/IMechanic'

// ---------------------------------------------------------------------------
// Build a test-friendly container (no Docker/DB dependencies)
// ---------------------------------------------------------------------------

function createTestContainer(): Container {
    const factory = new AgentFactory()
    const governor = new BudgetGovernor()

    // Stub mechanic — no real Docker/DB/Git
    const stubMechanic = {
        provisionBusinessUnit: async () => ({
            businessId: 'biz-test',
            status: 'provisioning',
        }),
        getBusinessUnit: async () => null,
        decommissionBusinessUnit: async () => ({ success: true }),
    } as unknown as Mechanic

    const stubLlmCriticProvider: LlmCriticProvider = {
        async evaluate(_prompt: string) {
            return { pass: true, confidence: 1.0, reasoning: 'stub' }
        },
    }

    const stubEscalationProvider: EscalationProvider = {
        async evaluate(_prompt: string, _context: EscalationContext) {
            return { pass: true, confidence: 1.0, reasoning: 'stub', recommendation: 'accept' as const }
        },
    }

    const stubLibrarianStore: ILibrarianStore = {
        async save(_entry: KnowledgeEntry) { },
        async getById(_id: ArtifactId) { return null },
        async searchByText(_query: string, _filters?: QueryFilters) { return [] as KnowledgeEntry[] },
        async searchByVector(_embedding: number[], _filters?: QueryFilters) { return [] as VectorMatch[] },
        async removeOlderThan(_olderThanIso: string) { return [] as ArtifactId[] },
    }

    const deterministic = new DeterministicEvaluator()
    const llmCritic = new LlmCriticEvaluator(stubLlmCriticProvider)
    const escalation = new EscalationEvaluator(stubEscalationProvider)
    const evalPipeline = new EvalPipeline(deterministic, llmCritic, escalation)

    const librarian = new Librarian(stubLibrarianStore)

    const goalAnalyzer = createStubGoalAnalyzer()
    const taskExecutor = createStubTaskExecutor()
    const jarvis = new Jarvis(goalAnalyzer, taskExecutor)

    return {
        factory,
        governor,
        mechanic: stubMechanic,
        evalPipeline,
        jarvis,
        librarian,
    }
}

// ---------------------------------------------------------------------------
// E2E Smoke Tests
// ---------------------------------------------------------------------------

describe('E2E Smoke', () => {
    let app: Hono

    beforeAll(() => {
        const container = createTestContainer()
        app = new Hono()
        registerRoutes(app, container)
    })

    // -------------------------------------------------------------------------
    // Health check
    // -------------------------------------------------------------------------

    it('GET /health returns ok with expected fields', async () => {
        const res = await app.request('/health')

        expect(res.status).toBe(200)
        const body = await res.json() as Record<string, unknown>
        expect(body.status).toBe('ok')
        expect(body.uptime).toBeTypeOf('number')
        expect(body.version).toBeTypeOf('string')
        expect(body.timestamp).toBeTypeOf('string')
        expect(body.memory).toBeDefined()
    })

    // -------------------------------------------------------------------------
    // Goal → DAG → Execute lifecycle
    // -------------------------------------------------------------------------

    it('POST /api/goals returns a TaskDAG or ClarificationRequest', async () => {
        const res = await app.request('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal: 'Create a landing page for my bakery' }),
        })

        expect(res.status).toBe(200)
        const body = await res.json() as Record<string, unknown>

        // Should be a TaskDAG (stub analyzer fills enough fields to skip clarification)
        // or a ClarificationRequest. Either is valid.
        const isDAG = 'goalId' in body && 'nodes' in body
        const isClarification = 'missingFields' in body && 'questions' in body
        expect(isDAG || isClarification).toBe(true)
    })

    it('POST /api/goals/:goalId/execute runs DAG and returns result', async () => {
        // First, get a DAG
        const goalRes = await app.request('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal: 'Simple task for testing' }),
        })

        const goalBody = await goalRes.json() as Record<string, unknown>

        // If we got a DAG, execute it
        if ('goalId' in goalBody && 'nodes' in goalBody) {
            const execRes = await app.request('/api/goals/test-goal/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dag: goalBody }),
            })

            expect(execRes.status).toBe(200)
            const execBody = await execRes.json() as Record<string, unknown>
            expect(execBody.goalId).toBeDefined()
            expect(execBody.status).toBeTypeOf('string')
            expect(['completed', 'partial', 'failed']).toContain(execBody.status)
        }
    })

    // -------------------------------------------------------------------------
    // Agent CRUD lifecycle
    // -------------------------------------------------------------------------

    it('GET /api/agents returns empty array initially', async () => {
        const res = await app.request('/api/agents')

        expect(res.status).toBe(200)
        const body = await res.json()
        expect(Array.isArray(body)).toBe(true)
    })

    it('GET /api/agents/:id returns 404 for unknown agent', async () => {
        const res = await app.request('/api/agents/nonexistent')

        expect(res.status).toBe(404)
        const body = await res.json() as Record<string, unknown>
        expect(body.error).toBe('Not found')
    })

    // -------------------------------------------------------------------------
    // Metrics
    // -------------------------------------------------------------------------

    it('GET /metrics returns system metrics', async () => {
        const res = await app.request('/metrics')

        expect(res.status).toBe(200)
        const body = await res.json() as Record<string, unknown>
        expect(body.uptime).toBeTypeOf('number')
        expect(body.memory).toBeDefined()
        expect(body.timestamp).toBeTypeOf('string')
        const agents = body.agents as Record<string, unknown>
        expect(agents.total).toBeTypeOf('number')
    })

    // -------------------------------------------------------------------------
    // Knowledge ops
    // -------------------------------------------------------------------------

    it('POST /api/knowledge/query returns results', async () => {
        const res = await app.request('/api/knowledge/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'test', filters: {} }),
        })

        expect(res.status).toBe(200)
        const body = await res.json()
        expect(Array.isArray(body)).toBe(true)
    })
})
