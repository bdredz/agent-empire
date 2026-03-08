import { describe, it, expect, vi } from 'vitest'
import { LlmGoalAnalyzer, type LlmProvider } from './LlmGoalAnalyzer'

// ---------------------------------------------------------------------------
// Mock LLM provider factory
// ---------------------------------------------------------------------------

function mockProvider(response: string): LlmProvider {
    return vi.fn().mockResolvedValue(response)
}

function mockProviderThatThrows(): LlmProvider {
    return vi.fn().mockRejectedValue(new Error('LLM unavailable'))
}

// ---------------------------------------------------------------------------
// Valid mock responses
// ---------------------------------------------------------------------------

const VALID_ANALYSIS_RESPONSE = JSON.stringify({
    fields: {
        objective: 'Create a landing page',
        scope: 'Single HTML page with contact form',
        constraints: 'Budget: $50',
        audience: 'Small business owners',
        success_criteria: 'Page loads in < 2s',
        dependencies: null,
        risk_tolerance: 'low',
        approval_required: 'yes',
        timeline: '1 week',
        priority: 'high',
    },
    suggestedTasks: ['Design wireframe', 'Implement HTML/CSS', 'Add contact form'],
    estimatedComplexity: 'medium',
})

const VALID_DECOMPOSITION_RESPONSE = JSON.stringify({
    tasks: [
        {
            name: 'Design wireframe',
            description: 'Create wireframe for landing page layout',
            role: 'researcher',
            priority: 'high',
            dependsOn: [],
            estimatedTokens: 500,
        },
        {
            name: 'Implement HTML',
            description: 'Build the landing page from wireframe',
            role: 'implementer',
            priority: 'normal',
            dependsOn: [0],
            estimatedTokens: 2000,
        },
        {
            name: 'Add contact form',
            description: 'Add a working contact form with validation',
            role: 'worker',
            priority: 'normal',
            dependsOn: [1],
            estimatedTokens: 1000,
        },
    ],
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LlmGoalAnalyzer', () => {
    describe('analyzeGoal', () => {
        it('extracts fields correctly from valid LLM JSON', async () => {
            const provider = mockProvider(VALID_ANALYSIS_RESPONSE)
            const analyzer = new LlmGoalAnalyzer(provider)

            const result = await analyzer.analyzeGoal('Create a landing page')

            expect(result.fields.objective).toBe('Create a landing page')
            expect(result.fields.scope).toBe('Single HTML page with contact form')
            expect(result.fields.audience).toBe('Small business owners')
            expect(result.suggestedTasks).toHaveLength(3)
            expect(result.estimatedComplexity).toBe('medium')
            expect(provider).toHaveBeenCalledOnce()
        })

        it('handles null fields from LLM response', async () => {
            const provider = mockProvider(VALID_ANALYSIS_RESPONSE)
            const analyzer = new LlmGoalAnalyzer(provider)

            const result = await analyzer.analyzeGoal('Create a landing page')

            expect(result.fields.dependencies).toBeNull()
        })

        it('returns fallback when LLM returns invalid JSON', async () => {
            const provider = mockProvider('This is not valid JSON at all')
            const analyzer = new LlmGoalAnalyzer(provider)

            const result = await analyzer.analyzeGoal('Build something')

            expect(result.fields.objective).toBe('Build something')
            expect(result.suggestedTasks).toContain('Execute: Build something')
            expect(result.estimatedComplexity).toBe('medium')
        })

        it('returns fallback when LLM throws error', async () => {
            const provider = mockProviderThatThrows()
            const analyzer = new LlmGoalAnalyzer(provider)

            const result = await analyzer.analyzeGoal('Do a thing')

            expect(result.fields.objective).toBe('Do a thing')
            expect(result.suggestedTasks).toContain('Execute: Do a thing')
        })

        it('extracts JSON from markdown code blocks', async () => {
            const wrapped = '```json\n' + VALID_ANALYSIS_RESPONSE + '\n```'
            const provider = mockProvider(wrapped)
            const analyzer = new LlmGoalAnalyzer(provider)

            const result = await analyzer.analyzeGoal('Create something')

            expect(result.fields.objective).toBe('Create a landing page')
            expect(result.suggestedTasks).toHaveLength(3)
        })

        it('passes system prompt to provider', async () => {
            const provider = mockProvider(VALID_ANALYSIS_RESPONSE)
            const analyzer = new LlmGoalAnalyzer(provider)

            await analyzer.analyzeGoal('Test goal')

            const callArgs = (provider as ReturnType<typeof vi.fn>).mock.calls[0] as string[]
            expect(callArgs[1]).toContain('Jarvis')
        })
    })

    describe('decomposeGoal', () => {
        const stubAnalysis = {
            fields: { objective: 'Create a landing page' },
            suggestedTasks: ['Design', 'Build'],
            estimatedComplexity: 'medium' as const,
        }

        it('produces valid TaskDAG with proper dependency wiring', async () => {
            const provider = mockProvider(VALID_DECOMPOSITION_RESPONSE)
            const analyzer = new LlmGoalAnalyzer(provider)

            const dag = await analyzer.decomposeGoal('Create a landing page', stubAnalysis)

            expect(dag.goalDescription).toBe('Create a landing page')
            expect(dag.nodes).toHaveLength(3)
            expect(dag.goalId).toMatch(/^goal-/)
            expect(dag.createdAt).toBeTruthy()

            // First node has no deps
            expect(dag.nodes[0]!.dependencies).toHaveLength(0)
            expect(dag.nodes[0]!.name).toBe('Design wireframe')

            // Second depends on first
            expect(dag.nodes[1]!.dependencies).toContain(dag.nodes[0]!.taskId)

            // Third depends on second
            expect(dag.nodes[2]!.dependencies).toContain(dag.nodes[1]!.taskId)
        })

        it('maps agent roles correctly', async () => {
            const provider = mockProvider(VALID_DECOMPOSITION_RESPONSE)
            const analyzer = new LlmGoalAnalyzer(provider)

            const dag = await analyzer.decomposeGoal('Create a page', stubAnalysis)

            expect(dag.nodes[0]!.assignedRole).toBe('researcher')
            expect(dag.nodes[1]!.assignedRole).toBe('implementer')
            expect(dag.nodes[2]!.assignedRole).toBe('worker')
        })

        it('handles invalid LLM response gracefully with fallback DAG', async () => {
            const provider = mockProvider('totally broken response')
            const analyzer = new LlmGoalAnalyzer(provider)

            const dag = await analyzer.decomposeGoal('Build it', stubAnalysis)

            expect(dag.nodes).toHaveLength(1)
            expect(dag.nodes[0]!.name).toBe('Fallback task')
            expect(dag.nodes[0]!.description).toBe('Build it')
        })

        it('handles LLM provider error with fallback DAG', async () => {
            const provider = mockProviderThatThrows()
            const analyzer = new LlmGoalAnalyzer(provider)

            const dag = await analyzer.decomposeGoal('Crash test', stubAnalysis)

            expect(dag.nodes).toHaveLength(1)
            expect(dag.nodes[0]!.name).toBe('Fallback task')
        })

        it('handles empty tasks array with fallback DAG', async () => {
            const provider = mockProvider(JSON.stringify({ tasks: [] }))
            const analyzer = new LlmGoalAnalyzer(provider)

            const dag = await analyzer.decomposeGoal('Empty test', stubAnalysis)

            expect(dag.nodes).toHaveLength(1)
            expect(dag.nodes[0]!.name).toBe('Fallback task')
        })

        it('ignores self-referencing dependency indices', async () => {
            const response = JSON.stringify({
                tasks: [
                    { name: 'Task A', description: 'A', role: 'worker', priority: 'normal', dependsOn: [0] },
                ],
            })
            const provider = mockProvider(response)
            const analyzer = new LlmGoalAnalyzer(provider)

            const dag = await analyzer.decomposeGoal('Self-ref test', stubAnalysis)

            expect(dag.nodes[0]!.dependencies).toHaveLength(0)
        })

        it('ignores out-of-bounds dependency indices', async () => {
            const response = JSON.stringify({
                tasks: [
                    { name: 'Task A', description: 'A', role: 'worker', priority: 'normal', dependsOn: [99, -1] },
                ],
            })
            const provider = mockProvider(response)
            const analyzer = new LlmGoalAnalyzer(provider)

            const dag = await analyzer.decomposeGoal('OOB test', stubAnalysis)

            expect(dag.nodes[0]!.dependencies).toHaveLength(0)
        })

        it('preserves estimatedTokens when provided', async () => {
            const provider = mockProvider(VALID_DECOMPOSITION_RESPONSE)
            const analyzer = new LlmGoalAnalyzer(provider)

            const dag = await analyzer.decomposeGoal('Token test', stubAnalysis)

            expect(dag.nodes[0]!.estimatedTokens).toBe(500)
            expect(dag.nodes[1]!.estimatedTokens).toBe(2000)
        })
    })
})
