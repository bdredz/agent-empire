import { TaskId, AgentId, AgentRole, TaskPriority, createTaskId } from '@shared/types'
import { nanoid } from 'nanoid'

// ---------------------------------------------------------------------------
// DAG Node — a single task in the graph
// ---------------------------------------------------------------------------

export interface DAGNode {
  readonly taskId: TaskId
  readonly name: string
  readonly description: string
  readonly assignedRole: AgentRole
  readonly assignedAgentId?: AgentId
  readonly dependencies: TaskId[]  // taskIds this node depends on
  readonly priority: TaskPriority
  readonly estimatedTokens?: number
  readonly status: DAGNodeStatus
}

export const DAGNodeStatus = {
  Pending: 'pending',
  Ready: 'ready',       // all dependencies satisfied
  Running: 'running',
  Succeeded: 'succeeded',
  Failed: 'failed',
  Skipped: 'skipped',
} as const
export type DAGNodeStatus = typeof DAGNodeStatus[keyof typeof DAGNodeStatus]

// ---------------------------------------------------------------------------
// TaskDAG — the full directed acyclic graph
// ---------------------------------------------------------------------------

export interface TaskDAG {
  readonly goalId: string
  readonly goalDescription: string
  readonly nodes: DAGNode[]
  readonly createdAt: string
}

// ---------------------------------------------------------------------------
// Execution Result
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  readonly goalId: string
  readonly status: 'completed' | 'partial' | 'failed'
  readonly completedNodes: TaskId[]
  readonly failedNodes: TaskId[]
  readonly skippedNodes: TaskId[]
  readonly totalDuration: number  // ms
}

// ---------------------------------------------------------------------------
// DAG Builder — constructs validated DAGs
// ---------------------------------------------------------------------------

export function createDAGNode(
  params: Omit<DAGNode, 'taskId' | 'status'>
): DAGNode {
  return {
    ...params,
    taskId: createTaskId(nanoid()),
    status: DAGNodeStatus.Pending,
  }
}

export function validateDAG(dag: TaskDAG): DAGValidationResult {
  const errors: string[] = []
  const nodeIds = new Set(dag.nodes.map((n) => n.taskId))

  // Check for missing dependencies
  for (const node of dag.nodes) {
    for (const dep of node.dependencies) {
      if (!nodeIds.has(dep)) {
        errors.push(`Node "${node.name}" depends on unknown taskId: ${dep}`)
      }
    }
  }

  // Check for cycles via topological sort
  if (errors.length === 0 && hasCycle(dag)) {
    errors.push('DAG contains a cycle')
  }

  // Check for empty DAG
  if (dag.nodes.length === 0) {
    errors.push('DAG has no nodes')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export interface DAGValidationResult {
  readonly valid: boolean
  readonly errors: string[]
}

// ---------------------------------------------------------------------------
// Get nodes ready to execute (all deps satisfied)
// ---------------------------------------------------------------------------

export function getReadyNodes(dag: TaskDAG): DAGNode[] {
  const completedIds = new Set(
    dag.nodes
      .filter((n) => n.status === DAGNodeStatus.Succeeded)
      .map((n) => n.taskId)
  )

  return dag.nodes.filter(
    (n) =>
      n.status === DAGNodeStatus.Pending &&
      n.dependencies.every((dep) => completedIds.has(dep))
  )
}

// ---------------------------------------------------------------------------
// Topological sort — returns execution order or null if cycle
// ---------------------------------------------------------------------------

export function topologicalSort(dag: TaskDAG): DAGNode[] | null {
  const inDegree = new Map<TaskId, number>()
  const adjacency = new Map<TaskId, TaskId[]>()
  const nodeMap = new Map<TaskId, DAGNode>()

  for (const node of dag.nodes) {
    nodeMap.set(node.taskId, node)
    inDegree.set(node.taskId, node.dependencies.length)
    if (!adjacency.has(node.taskId)) {
      adjacency.set(node.taskId, [])
    }
    for (const dep of node.dependencies) {
      const existing = adjacency.get(dep) ?? []
      existing.push(node.taskId)
      adjacency.set(dep, existing)
    }
  }

  const queue: TaskId[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: DAGNode[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    const node = nodeMap.get(current)
    if (node) sorted.push(node)

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  return sorted.length === dag.nodes.length ? sorted : null
}

function hasCycle(dag: TaskDAG): boolean {
  return topologicalSort(dag) === null
}
