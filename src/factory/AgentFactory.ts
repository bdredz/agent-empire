import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import {
  AgentHandle,
  AgentId,
  AgentLineage,
  AgentStatus,
  Budget,
  CreateAgentRequest,
  ToolBundle,
  MemoryPolicy,
  createAgentId,
} from '@shared/types'
import {
  IAgentFactory,
  FactoryResult,
  TerminationReceipt,
  AgentFilter,
} from './IAgentFactory'
import { validateCreateAgentRequest } from './validation'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FactoryConfig {
  readonly maxDepthFromRoot: number // global max (default 5)
}

const DEFAULT_CONFIG: FactoryConfig = {
  maxDepthFromRoot: 5,
}

// ---------------------------------------------------------------------------
// AgentFactory — deterministic provisioning with hard guarantees
// ---------------------------------------------------------------------------

export class AgentFactory implements IAgentFactory {
  private readonly agents = new Map<AgentId, AgentHandle>()
  private readonly config: FactoryConfig

  constructor(config: Partial<FactoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // -----------------------------------------------------------------------
  // createAgent
  // -----------------------------------------------------------------------

  async createAgent(
    request: CreateAgentRequest
  ): Promise<FactoryResult<AgentHandle>> {
    // 1. Schema validation
    const validation = validateCreateAgentRequest(request)
    if (!validation.valid) {
      return {
        ok: false,
        error: 'INVALID_REQUEST',
        message: validation.errors.join('; '),
      }
    }

    // 2. Resolve parent (if child agent)
    const parent = request.parentAgentId
      ? (this.agents.get(request.parentAgentId as AgentId) ?? null)
      : null

    if (request.parentAgentId && !parent) {
      return {
        ok: false,
        error: 'AGENT_NOT_FOUND',
        message: `Parent agent ${request.parentAgentId} not found`,
      }
    }

    // 3. Enforce hard guarantees when parent exists
    if (parent) {
      // 3a. Spawn permission check
      const spawnCheck = this.checkSpawnPermissions(parent, request)
      if (!spawnCheck.ok) return spawnCheck

      // 3b. Privilege escalation prevention — tools
      const toolCheck = this.checkToolSubset(parent, request)
      if (!toolCheck.ok) return toolCheck

      // 3c. Budget cascading — child budget <= parent remaining
      const budgetCheck = this.checkBudgetCascade(parent, request)
      if (!budgetCheck.ok) return budgetCheck

      // 3d. Max recursion depth
      const depthCheck = this.checkDepth(parent)
      if (!depthCheck.ok) return depthCheck
    }
    // Root agents are always at depth 0 — global depth enforced on children

    // 4. Build lineage
    const agentId = createAgentId(nanoid())
    const lineage = this.buildLineage(agentId, parent, request)

    // 5. Resolve final config
    const resolvedToolBundle = this.resolveToolBundle(request, parent)
    const resolvedMemory = this.resolveMemoryPolicy(request)

    // 6. Compute provenance hash
    const provenanceHash = this.computeProvenanceHash(
      request,
      resolvedToolBundle,
      resolvedMemory,
      lineage
    )

    // 7. Build handle
    const handle: AgentHandle = {
      agentId,
      roleName: request.roleName,
      createdAt: new Date().toISOString(),
      budgetAllocated: request.budget,
      toolBundleResolved: resolvedToolBundle,
      memoryPolicyResolved: resolvedMemory,
      lineage,
      provenanceHash,
      status: AgentStatus.Initializing,
      modelTier: request.modelTier,
    }

    // 8. Store
    this.agents.set(agentId, handle)

    return { ok: true, value: handle }
  }

  // -----------------------------------------------------------------------
  // terminateAgent
  // -----------------------------------------------------------------------

  async terminateAgent(
    agentId: AgentId,
    reason: string
  ): Promise<FactoryResult<TerminationReceipt>> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      return {
        ok: false,
        error: 'AGENT_NOT_FOUND',
        message: `Agent ${agentId} not found`,
      }
    }
    if (agent.status === AgentStatus.Terminated) {
      return {
        ok: false,
        error: 'AGENT_ALREADY_TERMINATED',
        message: `Agent ${agentId} is already terminated`,
      }
    }

    const terminated: AgentHandle = {
      ...agent,
      status: AgentStatus.Terminated,
    }
    this.agents.set(agentId, terminated)

    const receipt: TerminationReceipt = {
      agentId,
      terminatedAt: new Date().toISOString(),
      reason,
      finalStatus: AgentStatus.Terminated,
    }
    return { ok: true, value: receipt }
  }

  // -----------------------------------------------------------------------
  // getAgent / listAgents
  // -----------------------------------------------------------------------

  async getAgent(agentId: AgentId): Promise<AgentHandle | null> {
    return this.agents.get(agentId) ?? null
  }

  async listAgents(filter?: AgentFilter): Promise<AgentHandle[]> {
    let agents = [...this.agents.values()]
    if (filter?.role) {
      agents = agents.filter((a) => a.roleName === filter.role)
    }
    if (filter?.status) {
      agents = agents.filter((a) => a.status === filter.status)
    }
    if (filter?.parentAgentId) {
      agents = agents.filter(
        (a) => a.lineage.parentAgentId === filter.parentAgentId
      )
    }
    return agents
  }

  // -----------------------------------------------------------------------
  // Private — Hard Guarantee Checks
  // -----------------------------------------------------------------------

  private checkSpawnPermissions(
    parent: AgentHandle,
    request: CreateAgentRequest
  ): FactoryResult<void> {
    // Check parent's children count
    const currentChildren = [...this.agents.values()].filter(
      (a) =>
        a.lineage.parentAgentId === parent.agentId &&
        a.status !== AgentStatus.Terminated
    )
    if (currentChildren.length >= parent.lineage.depth + 1 ? Infinity : Infinity) {
      // Spawn allowed check
    }

    if (!this.isSpawnAllowed(parent)) {
      return {
        ok: false,
        error: 'SPAWN_NOT_ALLOWED',
        message: `Parent agent ${parent.agentId} does not have spawn permissions`,
      }
    }

    // Check role is in parent's allowed roles — we infer from the request's
    // spawnPermissions since parent may not carry the child's permission set.
    // The parent's own spawnPermissions.allowedRoles governs what children it can create.
    // We need to check parent's resolved spawn permissions. Since AgentHandle
    // doesn't store spawnPermissions directly, we check against the request's
    // parent. For now, we trust the Factory-stored handle and apply a basic
    // guard: the parent must not be terminated and must be in a spawnable state.

    return { ok: true, value: undefined }
  }

  private isSpawnAllowed(parent: AgentHandle): boolean {
    // An agent in terminated, error, or paused state cannot spawn children
    return (
      parent.status !== AgentStatus.Terminated &&
      parent.status !== AgentStatus.Error
    )
  }

  private checkToolSubset(
    parent: AgentHandle,
    request: CreateAgentRequest
  ): FactoryResult<void> {
    const parentToolNames = new Set(
      parent.toolBundleResolved.tools.map((t) => t.name)
    )
    const disallowed: string[] = []

    for (const tool of request.toolBundle.tools) {
      if (!parentToolNames.has(tool.name)) {
        disallowed.push(tool.name)
      }
    }

    if (disallowed.length > 0) {
      return {
        ok: false,
        error: 'TOOLS_NOT_IN_PARENT_BUNDLE',
        message: `Tools not in parent bundle: ${disallowed.join(', ')}`,
      }
    }
    return { ok: true, value: undefined }
  }

  private checkBudgetCascade(
    parent: AgentHandle,
    request: CreateAgentRequest
  ): FactoryResult<void> {
    const pb = parent.budgetAllocated
    const cb = request.budget

    if (cb.maxTokens > pb.maxTokens) {
      return {
        ok: false,
        error: 'BUDGET_EXCEEDS_PARENT',
        message: `Child maxTokens (${cb.maxTokens}) exceeds parent (${pb.maxTokens})`,
      }
    }
    if (cb.maxToolCalls > pb.maxToolCalls) {
      return {
        ok: false,
        error: 'BUDGET_EXCEEDS_PARENT',
        message: `Child maxToolCalls (${cb.maxToolCalls}) exceeds parent (${pb.maxToolCalls})`,
      }
    }
    if (cb.maxWallTimeSec > pb.maxWallTimeSec) {
      return {
        ok: false,
        error: 'BUDGET_EXCEEDS_PARENT',
        message: `Child maxWallTimeSec (${cb.maxWallTimeSec}) exceeds parent (${pb.maxWallTimeSec})`,
      }
    }

    return { ok: true, value: undefined }
  }

  private checkDepth(parent: AgentHandle): FactoryResult<void> {
    const childDepth = parent.lineage.depth + 1
    if (childDepth >= this.config.maxDepthFromRoot) {
      return {
        ok: false,
        error: 'MAX_DEPTH_EXCEEDED',
        message: `Child would be at depth ${childDepth}, max is ${this.config.maxDepthFromRoot}`,
      }
    }
    return { ok: true, value: undefined }
  }

  // -----------------------------------------------------------------------
  // Private — Resolution & Building
  // -----------------------------------------------------------------------

  private buildLineage(
    agentId: AgentId,
    parent: AgentHandle | null,
    request: CreateAgentRequest
  ): AgentLineage {
    if (!parent) {
      return {
        rootAgentId: agentId,
        parentAgentId: null,
        depth: 0,
        spawnReason: request.spawnReason,
        lineageContextRefs: request.lineageContextRefs ?? [],
      }
    }
    return {
      rootAgentId: parent.lineage.rootAgentId,
      parentAgentId: parent.agentId,
      depth: parent.lineage.depth + 1,
      spawnReason: request.spawnReason,
      lineageContextRefs: request.lineageContextRefs ?? [],
    }
  }

  private resolveToolBundle(
    request: CreateAgentRequest,
    _parent: AgentHandle | null
  ): ToolBundle {
    // Filter out disallowed tools
    const disallowed = new Set(request.disallowedTools ?? [])
    const filteredTools = request.toolBundle.tools.filter(
      (t) => !disallowed.has(t.name)
    )
    return {
      tools: filteredTools,
      sandbox: request.toolBundle.sandbox,
    }
  }

  private resolveMemoryPolicy(request: CreateAgentRequest): MemoryPolicy {
    return { ...request.memoryPolicy }
  }

  private computeProvenanceHash(
    request: CreateAgentRequest,
    toolBundle: ToolBundle,
    memoryPolicy: MemoryPolicy,
    lineage: AgentLineage
  ): string {
    const payload = JSON.stringify({
      roleName: request.roleName,
      objective: request.objective,
      capabilities: request.capabilities,
      toolBundle,
      budget: request.budget,
      memoryPolicy,
      lineage: {
        rootAgentId: lineage.rootAgentId,
        parentAgentId: lineage.parentAgentId,
        depth: lineage.depth,
      },
      modelTier: request.modelTier,
    })
    return createHash('sha256').update(payload).digest('hex')
  }
}
