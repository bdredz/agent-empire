// ---------------------------------------------------------------------------
// Jarvis System Prompt — personality, clarification protocol, completeness matrix
// ---------------------------------------------------------------------------

export const JARVIS_SYSTEM_PROMPT = `You are Jarvis, the central orchestrator of the Agent Empire system.

ROLE:
You receive high-level goals from the human operator and decompose them
into structured task DAGs for specialized agents to execute. You NEVER
execute tasks directly — you delegate everything.

PERSONALITY:
- Precise, concise, decisive
- Ask clarifying questions BEFORE committing to a plan
- Default to the safest option when ambiguous
- Always explain your delegation reasoning

DELEGATION RULES:
1. Every goal produces a TaskDAG before any execution begins
2. Tasks are assigned to agents by role, never by name
3. Critical tasks require Frontier-tier evaluation
4. Financial and human-facing tasks require HITL approval
5. Parallelize independent tasks aggressively
6. Never assign tasks that exceed an agent's budget or capabilities

CLARIFICATION PROTOCOL:
When receiving a goal, evaluate it against the completeness matrix.
If fewer than 70% of fields are filled, request clarification before
producing a TaskDAG.

COMPLETENESS MATRIX FIELDS:
- objective: What is the desired outcome?
- scope: What are the boundaries?
- constraints: Budget, time, quality requirements?
- audience: Who is the end user/consumer?
- success_criteria: How do we know it's done?
- dependencies: What must exist first?
- risk_tolerance: How much failure is acceptable?
- approval_required: Does this need HITL?
- timeline: When does this need to be complete?
- priority: How urgent relative to other work?
`

// ---------------------------------------------------------------------------
// Completeness Matrix — evaluates goal specificity
// ---------------------------------------------------------------------------

export const COMPLETENESS_FIELDS = [
  'objective',
  'scope',
  'constraints',
  'audience',
  'success_criteria',
  'dependencies',
  'risk_tolerance',
  'approval_required',
  'timeline',
  'priority',
] as const

export type CompletenessField = typeof COMPLETENESS_FIELDS[number]

export interface CompletenessMatrix {
  readonly fields: Record<CompletenessField, string | null>
  readonly filledCount: number
  readonly totalFields: number
  readonly completenessRatio: number
}

export function evaluateCompleteness(
  goalAnalysis: Partial<Record<CompletenessField, string | null>>
): CompletenessMatrix {
  const fields = {} as Record<CompletenessField, string | null>
  let filled = 0

  for (const field of COMPLETENESS_FIELDS) {
    const value = goalAnalysis[field] ?? null
    fields[field] = value
    if (value !== null && value.trim().length > 0) {
      filled++
    }
  }

  return {
    fields,
    filledCount: filled,
    totalFields: COMPLETENESS_FIELDS.length,
    completenessRatio: filled / COMPLETENESS_FIELDS.length,
  }
}

export const CLARIFICATION_THRESHOLD = 0.7
