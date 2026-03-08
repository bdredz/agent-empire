import { describe, it, expect, beforeEach } from 'vitest'
import { AgentFactory } from './AgentFactory'
import {
  CreateAgentRequest,
  AgentRole,
  AgentStatus,
  Capability,
  ToolScope,
  SandboxNetwork,
  MemoryMode,
  ChildBudgetPolicy,
  ModelTier,
  AgentId,
  createAgentId,
} from '@shared/types'
import { FactoryResult } from './IAgentFactory'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeValidRequest(
  overrides: Partial<CreateAgentRequest> = {}
): CreateAgentRequest {
  return {
    spawnReason: 'test agent creation',
    roleName: AgentRole.Worker,
    objective: 'perform test tasks',
    instructions: 'follow the spec',
    capabilities: [Capability.CodeGeneration],
    requiredTools: [
      { name: 'code_gen', scope: ToolScope.ReadWrite, permissions: ['write'] },
    ],
    toolBundle: {
      tools: [
        {
          name: 'code_gen',
          scope: ToolScope.ReadWrite,
          permissions: ['write'],
        },
      ],
      sandbox: {
        network: SandboxNetwork.Restricted,
        filesystem: 'ephemeral',
      },
    },
    budget: {
      maxTokens: 10000,
      maxToolCalls: 100,
      maxWallTimeSec: 600,
    },
    memoryPolicy: {
      mode: MemoryMode.Ephemeral,
      allowedArtifactReads: ['*'],
      allowedArtifactWrites: ['own/*'],
    },
    spawnPermissions: {
      allowed: true,
      maxChildren: 3,
      maxDepthFromRoot: 3,
      allowedRoles: [AgentRole.Worker],
      childBudgetPolicy: ChildBudgetPolicy.InheritScaled,
    },
    modelTier: ModelTier.Fast,
    ...overrides,
  } as CreateAgentRequest
}

function assertOk<T>(result: FactoryResult<T>): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Expected ok result')
  return result.value
}

function assertErr<T>(result: FactoryResult<T>): { error: string; message: string } {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('Expected error result')
  return { error: result.error, message: result.message }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentFactory', () => {
  let factory: AgentFactory

  beforeEach(() => {
    factory = new AgentFactory({ maxDepthFromRoot: 5 })
  })

  // -----------------------------------------------------------------------
  // 1. Creates agent with valid request
  // -----------------------------------------------------------------------
  it('creates agent with valid request', async () => {
    const request = makeValidRequest()
    const result = await factory.createAgent(request)
    const handle = assertOk(result)

    expect(handle.agentId).toBeTruthy()
    expect(handle.roleName).toBe(AgentRole.Worker)
    expect(handle.status).toBe(AgentStatus.Initializing)
    expect(handle.modelTier).toBe(ModelTier.Fast)
    expect(handle.createdAt).toBeTruthy()
    expect(handle.provenanceHash).toBeTruthy()
  })

  // -----------------------------------------------------------------------
  // 2. Rejects request with budget exceeding parent
  // -----------------------------------------------------------------------
  it('rejects child with budget exceeding parent', async () => {
    const parent = assertOk(await factory.createAgent(makeValidRequest()))

    const childReq = makeValidRequest({
      parentAgentId: parent.agentId,
      budget: {
        maxTokens: 999999,
        maxToolCalls: 100,
        maxWallTimeSec: 600,
      },
    })
    const result = await factory.createAgent(childReq)
    const err = assertErr(result)
    expect(err.error).toBe('BUDGET_EXCEEDS_PARENT')
  })

  // -----------------------------------------------------------------------
  // 3. Rejects request with tools not in parent's bundle
  // -----------------------------------------------------------------------
  it('rejects child with tools not in parent bundle', async () => {
    const parent = assertOk(await factory.createAgent(makeValidRequest()))

    const childReq = makeValidRequest({
      parentAgentId: parent.agentId,
      budget: {
        maxTokens: 5000,
        maxToolCalls: 50,
        maxWallTimeSec: 300,
      },
      toolBundle: {
        tools: [
          {
            name: 'secret_tool',
            scope: ToolScope.Execute,
            permissions: ['admin'],
          },
        ],
        sandbox: {
          network: SandboxNetwork.None,
          filesystem: 'none',
        },
      },
    })

    const result = await factory.createAgent(childReq)
    const err = assertErr(result)
    expect(err.error).toBe('TOOLS_NOT_IN_PARENT_BUNDLE')
    expect(err.message).toContain('secret_tool')
  })

  // -----------------------------------------------------------------------
  // 4. Rejects request exceeding max recursion depth
  // -----------------------------------------------------------------------
  it('rejects when max recursion depth exceeded', async () => {
    const shallowFactory = new AgentFactory({ maxDepthFromRoot: 2 })

    const root = assertOk(
      await shallowFactory.createAgent(makeValidRequest())
    )

    const childReq = makeValidRequest({
      parentAgentId: root.agentId,
      budget: { maxTokens: 5000, maxToolCalls: 50, maxWallTimeSec: 300 },
    })
    const child = assertOk(await shallowFactory.createAgent(childReq))

    // depth 2 = at the limit
    const grandchildReq = makeValidRequest({
      parentAgentId: child.agentId,
      budget: { maxTokens: 2000, maxToolCalls: 20, maxWallTimeSec: 100 },
    })
    const result = await shallowFactory.createAgent(grandchildReq)
    const err = assertErr(result)
    expect(err.error).toBe('MAX_DEPTH_EXCEEDED')
  })

  // -----------------------------------------------------------------------
  // 5. Generates unique agentId per creation
  // -----------------------------------------------------------------------
  it('generates unique agentId per creation', async () => {
    const r1 = assertOk(await factory.createAgent(makeValidRequest()))
    const r2 = assertOk(await factory.createAgent(makeValidRequest()))
    const r3 = assertOk(await factory.createAgent(makeValidRequest()))

    const ids = new Set([r1.agentId, r2.agentId, r3.agentId])
    expect(ids.size).toBe(3)
  })

  // -----------------------------------------------------------------------
  // 6. Computes deterministic provenance hash
  // -----------------------------------------------------------------------
  it('computes deterministic provenance hash', async () => {
    const handle = assertOk(await factory.createAgent(makeValidRequest()))
    expect(handle.provenanceHash).toMatch(/^[a-f0-9]{64}$/)
  })

  // -----------------------------------------------------------------------
  // 7. Sets correct lineage for root agent (no parent)
  // -----------------------------------------------------------------------
  it('sets correct lineage for root agent', async () => {
    const handle = assertOk(await factory.createAgent(makeValidRequest()))

    expect(handle.lineage.rootAgentId).toBe(handle.agentId)
    expect(handle.lineage.parentAgentId).toBeNull()
    expect(handle.lineage.depth).toBe(0)
    expect(handle.lineage.spawnReason).toBe('test agent creation')
  })

  // -----------------------------------------------------------------------
  // 8. Sets correct lineage for child agent
  // -----------------------------------------------------------------------
  it('sets correct lineage for child agent', async () => {
    const parent = assertOk(await factory.createAgent(makeValidRequest()))

    const childReq = makeValidRequest({
      parentAgentId: parent.agentId,
      spawnReason: 'delegated sub-task',
      budget: { maxTokens: 5000, maxToolCalls: 50, maxWallTimeSec: 300 },
    })
    const child = assertOk(await factory.createAgent(childReq))

    expect(child.lineage.rootAgentId).toBe(parent.agentId)
    expect(child.lineage.parentAgentId).toBe(parent.agentId)
    expect(child.lineage.depth).toBe(1)
    expect(child.lineage.spawnReason).toBe('delegated sub-task')
  })

  // -----------------------------------------------------------------------
  // 9. Terminates agent and returns receipt
  // -----------------------------------------------------------------------
  it('terminates agent and returns receipt', async () => {
    const handle = assertOk(await factory.createAgent(makeValidRequest()))

    const result = await factory.terminateAgent(handle.agentId, 'task complete')
    const receipt = assertOk(result)

    expect(receipt.agentId).toBe(handle.agentId)
    expect(receipt.reason).toBe('task complete')
    expect(receipt.finalStatus).toBe(AgentStatus.Terminated)
    expect(receipt.terminatedAt).toBeTruthy()

    // Verify agent status updated in store
    const updated = await factory.getAgent(handle.agentId)
    expect(updated?.status).toBe(AgentStatus.Terminated)
  })

  // -----------------------------------------------------------------------
  // 10. Rejects termination of already-terminated agent
  // -----------------------------------------------------------------------
  it('rejects termination of already-terminated agent', async () => {
    const handle = assertOk(await factory.createAgent(makeValidRequest()))
    assertOk(await factory.terminateAgent(handle.agentId, 'first'))

    const result = await factory.terminateAgent(handle.agentId, 'second')
    const err = assertErr(result)
    expect(err.error).toBe('AGENT_ALREADY_TERMINATED')
  })

  // -----------------------------------------------------------------------
  // 11. Lists agents with role filter
  // -----------------------------------------------------------------------
  it('lists agents with role filter', async () => {
    assertOk(
      await factory.createAgent(
        makeValidRequest({ roleName: AgentRole.Worker })
      )
    )
    assertOk(
      await factory.createAgent(
        makeValidRequest({ roleName: AgentRole.Mechanic })
      )
    )
    assertOk(
      await factory.createAgent(
        makeValidRequest({ roleName: AgentRole.Worker })
      )
    )

    const workers = await factory.listAgents({ role: AgentRole.Worker })
    expect(workers.length).toBe(2)
    expect(workers.every((a) => a.roleName === AgentRole.Worker)).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 12. Lists agents with status filter
  // -----------------------------------------------------------------------
  it('lists agents with status filter', async () => {
    const a = assertOk(await factory.createAgent(makeValidRequest()))
    assertOk(await factory.createAgent(makeValidRequest()))
    await factory.terminateAgent(a.agentId, 'done')

    const terminated = await factory.listAgents({
      status: AgentStatus.Terminated,
    })
    expect(terminated.length).toBe(1)
    expect(terminated[0]!.agentId).toBe(a.agentId)

    const initializing = await factory.listAgents({
      status: AgentStatus.Initializing,
    })
    expect(initializing.length).toBe(1)
  })

  // -----------------------------------------------------------------------
  // 13. Enforces spawn permission checks
  // -----------------------------------------------------------------------
  it('rejects child spawn from terminated parent', async () => {
    const parent = assertOk(await factory.createAgent(makeValidRequest()))
    await factory.terminateAgent(parent.agentId, 'done')

    const childReq = makeValidRequest({
      parentAgentId: parent.agentId,
      budget: { maxTokens: 5000, maxToolCalls: 50, maxWallTimeSec: 300 },
    })
    const result = await factory.createAgent(childReq)
    const err = assertErr(result)
    expect(err.error).toBe('SPAWN_NOT_ALLOWED')
  })

  // -----------------------------------------------------------------------
  // 14. Handles concurrent creation safely
  // -----------------------------------------------------------------------
  it('handles concurrent creation safely', async () => {
    const promises = Array.from({ length: 10 }, () =>
      factory.createAgent(makeValidRequest())
    )
    const results = await Promise.all(promises)

    const ids = new Set(
      results
        .filter((r) => r.ok)
        .map((r) => (r as { ok: true; value: { agentId: string } }).value.agentId)
    )
    expect(ids.size).toBe(10)
  })

  // -----------------------------------------------------------------------
  // 15. Rejects disallowed tools
  // -----------------------------------------------------------------------
  it('filters disallowed tools from resolved bundle', async () => {
    const request = makeValidRequest({
      toolBundle: {
        tools: [
          {
            name: 'code_gen',
            scope: ToolScope.ReadWrite,
            permissions: ['write'],
          },
          {
            name: 'web_browse',
            scope: ToolScope.ReadOnly,
            permissions: ['read'],
          },
        ],
        sandbox: {
          network: SandboxNetwork.Restricted,
          filesystem: 'ephemeral',
        },
      },
      disallowedTools: ['web_browse'],
    })

    const handle = assertOk(await factory.createAgent(request))
    const toolNames = handle.toolBundleResolved.tools.map((t) => t.name)
    expect(toolNames).toContain('code_gen')
    expect(toolNames).not.toContain('web_browse')
  })

  // -----------------------------------------------------------------------
  // 16. Returns null for non-existent agent
  // -----------------------------------------------------------------------
  it('returns null for non-existent agent', async () => {
    const result = await factory.getAgent(createAgentId('nonexistent'))
    expect(result).toBeNull()
  })

  // -----------------------------------------------------------------------
  // 17. Rejects termination of non-existent agent
  // -----------------------------------------------------------------------
  it('rejects termination of non-existent agent', async () => {
    const result = await factory.terminateAgent(
      createAgentId('nonexistent'),
      'cleanup'
    )
    const err = assertErr(result)
    expect(err.error).toBe('AGENT_NOT_FOUND')
  })

  // -----------------------------------------------------------------------
  // 18. Budget - maxToolCalls exceeds parent
  // -----------------------------------------------------------------------
  it('rejects child with maxToolCalls exceeding parent', async () => {
    const parent = assertOk(await factory.createAgent(makeValidRequest()))

    const childReq = makeValidRequest({
      parentAgentId: parent.agentId,
      budget: { maxTokens: 5000, maxToolCalls: 999, maxWallTimeSec: 300 },
    })
    const err = assertErr(await factory.createAgent(childReq))
    expect(err.error).toBe('BUDGET_EXCEEDS_PARENT')
    expect(err.message).toContain('maxToolCalls')
  })
})
