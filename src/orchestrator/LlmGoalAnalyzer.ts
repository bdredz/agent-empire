import type { GoalAnalyzer, GoalAnalysis } from './IJarvis'
import type { TaskDAG } from './TaskDAG'
import { createDAGNode } from './TaskDAG'
import { AgentRole, TaskPriority, createTaskId } from '@shared/types'
import {
    COMPLETENESS_FIELDS,
    type CompletenessField,
    JARVIS_SYSTEM_PROMPT,
} from './systemPrompt'
import { nanoid } from 'nanoid'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// LLM Provider — injectable for testing
// ---------------------------------------------------------------------------

export interface LlmProvider {
    (prompt: string, system: string): Promise<string>
}

// ---------------------------------------------------------------------------
// Zod schemas for validating LLM output
// ---------------------------------------------------------------------------

const goalAnalysisSchema = z.object({
    fields: z.record(z.string().nullable()).default({}),
    suggestedTasks: z.array(z.string()).default([]),
    estimatedComplexity: z.enum(['low', 'medium', 'high']).default('medium'),
})

const taskNodeSchema = z.object({
    name: z.string(),
    description: z.string(),
    role: z.string().default('worker'),
    priority: z.string().default('normal'),
    dependsOn: z.array(z.number()).default([]),
    estimatedTokens: z.number().optional(),
})

const decompositionSchema = z.object({
    tasks: z.array(taskNodeSchema),
})

// ---------------------------------------------------------------------------
// Role / Priority mapping helpers
// ---------------------------------------------------------------------------

function mapRole(role: string): AgentRole {
    const normalized = role.toLowerCase()
    const roleMap: Record<string, AgentRole> = {
        orchestrator: AgentRole.Orchestrator,
        mechanic: AgentRole.Mechanic,
        librarian: AgentRole.Librarian,
        evaluator: AgentRole.Evaluator,
        researcher: AgentRole.Researcher,
        implementer: AgentRole.Implementer,
        marketer: AgentRole.Marketer,
        revenue_ops: AgentRole.RevenueOps,
        human_comms: AgentRole.HumanComms,
        security_auditor: AgentRole.SecurityAuditor,
        worker: AgentRole.Worker,
    }
    return roleMap[normalized] ?? AgentRole.Worker
}

function mapPriority(priority: string): TaskPriority {
    const normalized = priority.toLowerCase()
    const priorityMap: Record<string, TaskPriority> = {
        critical: TaskPriority.Critical,
        high: TaskPriority.High,
        normal: TaskPriority.Normal,
        low: TaskPriority.Low,
        background: TaskPriority.Background,
    }
    return priorityMap[normalized] ?? TaskPriority.Normal
}

// ---------------------------------------------------------------------------
// LlmGoalAnalyzer — LLM-backed implementation of GoalAnalyzer
// ---------------------------------------------------------------------------

export class LlmGoalAnalyzer implements GoalAnalyzer {
    constructor(private readonly llmProvider: LlmProvider) { }

    async analyzeGoal(goal: string): Promise<GoalAnalysis> {
        const prompt = `Analyze the following goal and extract information for each completeness matrix field.
Return ONLY valid JSON matching this shape:
{
  "fields": { ${COMPLETENESS_FIELDS.map((f) => `"${f}": "<value or null>"`).join(', ')} },
  "suggestedTasks": ["task1", "task2"],
  "estimatedComplexity": "low" | "medium" | "high"
}

GOAL: "${goal}"`

        try {
            const raw = await this.llmProvider(prompt, JARVIS_SYSTEM_PROMPT)
            const json = extractJson(raw)
            const parsed = goalAnalysisSchema.parse(json)

            const fields: Partial<Record<CompletenessField, string | null>> = {}
            for (const field of COMPLETENESS_FIELDS) {
                const value = parsed.fields[field]
                fields[field] = typeof value === 'string' ? value : null
            }

            return {
                fields,
                suggestedTasks: parsed.suggestedTasks,
                estimatedComplexity: parsed.estimatedComplexity,
            }
        } catch {
            // Graceful fallback — return minimal analysis rather than crashing
            return {
                fields: { objective: goal },
                suggestedTasks: [`Execute: ${goal}`],
                estimatedComplexity: 'medium',
            }
        }
    }

    async decomposeGoal(goal: string, analysis: GoalAnalysis): Promise<TaskDAG> {
        const prompt = `Decompose this goal into a list of executable tasks.
Each task can depend on other tasks by index (0-based).

Goal: "${goal}"
Analysis: ${JSON.stringify(analysis)}

Return ONLY valid JSON matching this shape:
{
  "tasks": [
    {
      "name": "string",
      "description": "string",
      "role": "worker|implementer|researcher|mechanic|...",
      "priority": "critical|high|normal|low|background",
      "dependsOn": [0, 1],
      "estimatedTokens": 1000
    }
  ]
}`

        try {
            const raw = await this.llmProvider(prompt, JARVIS_SYSTEM_PROMPT)
            const json = extractJson(raw)
            const parsed = decompositionSchema.parse(json)

            if (parsed.tasks.length === 0) {
                return buildSingleNodeDAG(goal)
            }

            // Build nodes first to get stable taskIds
            const nodes = parsed.tasks.map((t) =>
                createDAGNode({
                    name: t.name,
                    description: t.description,
                    assignedRole: mapRole(t.role),
                    priority: mapPriority(t.priority),
                    dependencies: [], // wired below
                    estimatedTokens: t.estimatedTokens,
                })
            )

            // Wire dependencies by index → taskId
            const wiredNodes = nodes.map((node, i) => {
                const taskDef = parsed.tasks[i]
                if (!taskDef) return node
                const deps = taskDef.dependsOn
                    .filter((idx) => idx >= 0 && idx < nodes.length && idx !== i)
                    .map((idx) => nodes[idx]!.taskId)
                return { ...node, dependencies: deps }
            })

            return {
                goalId: `goal-${nanoid()}`,
                goalDescription: goal,
                nodes: wiredNodes,
                createdAt: new Date().toISOString(),
            }
        } catch {
            return buildSingleNodeDAG(goal)
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSingleNodeDAG(goal: string): TaskDAG {
    return {
        goalId: `goal-${nanoid()}`,
        goalDescription: goal,
        nodes: [
            createDAGNode({
                name: 'Fallback task',
                description: goal,
                assignedRole: AgentRole.Worker,
                priority: TaskPriority.Normal,
                dependencies: [],
            }),
        ],
        createdAt: new Date().toISOString(),
    }
}

function extractJson(text: string): unknown {
    // Try direct parse first
    try {
        return JSON.parse(text)
    } catch {
        // Extract JSON from markdown code blocks or surrounding text
        const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
        if (jsonMatch?.[1]) {
            return JSON.parse(jsonMatch[1])
        }
        // Try finding first { to last }
        const start = text.indexOf('{')
        const end = text.lastIndexOf('}')
        if (start !== -1 && end > start) {
            return JSON.parse(text.slice(start, end + 1))
        }
        throw new Error('No JSON found in LLM response')
    }
}
