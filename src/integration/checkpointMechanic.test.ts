/**
 * Integration test: checkpoint resume + Mechanic safety rejection
 *
 * Covers:
 *  1. Checkpoint save/resume — WorkflowResumer restores dispatcher state
 *  2. Completed nodes not re-executed on resume (not in readyNodeIds)
 *  3. Unsafe Mechanic action rejected by ActionPolicy
 *  4. Valid Mechanic action approved + recorded in MechanicAuditLog
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlinkSync, existsSync } from 'node:fs'

import {
  createTaskId,
  AgentRole,
  TaskPriority,
} from '@shared/types'
import type {
  AgentHandle,
  DispatcherState,
  MechanicAction,
  MechanicRequest,
  PlanEnvelope,
  WorkflowCheckpoint,
} from '@shared/types'

import type { ICheckpointStore } from '../runtime/checkpoints/ICheckpointStore'
import { WorkflowResumer } from '../runtime/checkpoints/WorkflowResumer'
import { ActionPolicy } from '@mechanic/ActionPolicy'
import { MechanicAuditLog } from '@mechanic/MechanicAuditLog'
import type { MechanicAuditRecord } from '@mechanic/MechanicAuditLog'
import { MechanicRequestValidator } from '@mechanic/MechanicRequestValidator'

// ---------------------------------------------------------------------------
// In-memory ICheckpointStore
// ---------------------------------------------------------------------------

class InMemoryCheckpointStore implements ICheckpointStore {
  private readonly store = new Map<string, WorkflowCheckpoint>()

  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    this.store.set(checkpoint.planId, checkpoint)
  }

  async load(planId: string): Promise<WorkflowCheckpoint | null> {
    return this.store.get(planId) ?? null
  }

  async list(tenantId: string): Promise<WorkflowCheckpoint[]> {
    return [...this.store.values()].filter((cp) => cp.tenantId === tenantId)
  }

  async delete(checkpointId: string): Promise<void> {
    for (const [key, val] of this.store.entries()) {
      if (val.checkpointId === checkpointId) {
        this.store.delete(key)
        return
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-abc'
const PLAN_ID = 'plan-001'

// Three nodes: A → B → C  (B depends on A, C depends on B)
const NODE_A = createTaskId('node-a')
const NODE_B = createTaskId('node-b')
const NODE_C = createTaskId('node-c')

function buildPlanEnvelope(): PlanEnvelope {
  return {
    planId: PLAN_ID,
    goalId: 'goal-001',
    tenantId: TENANT_ID,
    createdAt: new Date().toISOString(),
    createdBy: {
      agentId: 'jarvis' as unknown as import('@shared/types').AgentId,
      roleName: AgentRole.Orchestrator,
      modelTier: 'opus',
      createdAt: new Date().toISOString(),
      status: 'ready',
      budgetAllocated: { maxTokens: 100_000, maxToolCalls: 50, maxWallTimeSec: 600 },
      toolBundleResolved: [],
      memoryPolicyResolved: 'ephemeral',
      lineage: [],
      provenanceHash: 'test-hash',
    } as unknown as AgentHandle,
    taskDag: {
      goalId: 'goal-001',
      goalDescription: 'Test goal',
      nodes: [
        {
          taskId: NODE_A,
          name: 'Node A',
          description: 'First task',
          assignedRole: AgentRole.Worker,
          dependencies: [],
          priority: TaskPriority.Normal,
          status: 'pending' as const,
        },
        {
          taskId: NODE_B,
          name: 'Node B',
          description: 'Second task — depends on A',
          assignedRole: AgentRole.Worker,
          dependencies: [NODE_A],
          priority: TaskPriority.Normal,
          status: 'pending' as const,
        },
        {
          taskId: NODE_C,
          name: 'Node C',
          description: 'Third task — depends on B',
          assignedRole: AgentRole.Worker,
          dependencies: [NODE_B],
          priority: TaskPriority.Normal,
          status: 'pending' as const,
        },
      ],
      createdAt: new Date().toISOString(),
    },
    budgetEnvelope: {
      maxTokens: 50_000,
      maxToolCalls: 500,
      maxWallTimeSec: 3600,
    },
    escalationPolicy: {
      maxRetriesPerNode: 3,
      escalateOnBudgetTrip: true,
      escalateOnEvalFailure: true,
      escalateOnMechanicUnsafeAction: true,
    },
    retrievalPolicy: {
      tenantId: TENANT_ID,
      includeGlobalArchitecture: false,
      maxFacts: 20,
      maxTokens: 2000,
      allowedKinds: ['observation', 'verified_pattern'],
    },
  }
}

function buildDispatcherState(completedNodeIds: string[]): DispatcherState {
  return {
    planId: PLAN_ID,
    tenantId: TENANT_ID,
    activeNodeIds: [],
    completedNodeIds,
    failedNodeIds: [],
    retryCounts: {},
    waitingNodeIds: [],
    executionStatus: 'running',
  }
}

function buildCheckpoint(dispatcherState: DispatcherState): WorkflowCheckpoint {
  return {
    checkpointId: 'cp-001',
    planId: PLAN_ID,
    tenantId: TENANT_ID,
    status: 'running',
    dispatcherState,
    serializedNodeStates: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Checkpoint / WorkflowResumer tests
// ---------------------------------------------------------------------------

describe('WorkflowResumer — checkpoint save and resume', () => {
  let store: InMemoryCheckpointStore
  let resumer: WorkflowResumer
  let envelope: PlanEnvelope

  beforeEach(() => {
    store = new InMemoryCheckpointStore()
    resumer = new WorkflowResumer(store)
    envelope = buildPlanEnvelope()
  })

  it('resumes a saved checkpoint and returns dispatcher state', async () => {
    // Checkpoint with node A completed; B and C still pending
    const dispatcherState = buildDispatcherState([NODE_A as string])
    const checkpoint = buildCheckpoint(dispatcherState)
    await store.save(checkpoint)

    const result = await resumer.resume(PLAN_ID, envelope)

    expect(result.resumed).toBe(true)
    expect(result.dispatcherState).toBeDefined()
    expect(result.dispatcherState?.completedNodeIds).toContain(NODE_A as string)
    expect(result.escalationReason).toBeUndefined()
  })

  it('returns resumed:false when no checkpoint exists for planId', async () => {
    const result = await resumer.resume('nonexistent-plan', envelope)

    expect(result.resumed).toBe(false)
    expect(result.readyNodeIds).toEqual([])
    expect(result.dispatcherState).toBeUndefined()
  })

  it('completed nodes are excluded from readyNodeIds on resume', async () => {
    // A is completed; only B should be ready (it has A as its only dep)
    const dispatcherState = buildDispatcherState([NODE_A as string])
    await store.save(buildCheckpoint(dispatcherState))

    const result = await resumer.resume(PLAN_ID, envelope)

    expect(result.resumed).toBe(true)
    // NODE_A is completed — must NOT appear in readyNodeIds
    expect(result.readyNodeIds).not.toContain(NODE_A as string)
    // NODE_B depends only on A which is done — it IS ready
    expect(result.readyNodeIds).toContain(NODE_B as string)
    // NODE_C depends on B which is not yet complete — NOT ready
    expect(result.readyNodeIds).not.toContain(NODE_C as string)
  })

  it('returns escalationReason durability_fault when planId mismatches', async () => {
    // Save a checkpoint whose dispatcherState.planId does not match the envelope
    const mismatchedState: DispatcherState = {
      ...buildDispatcherState([]),
      planId: 'completely-different-plan',
    }
    const checkpoint: WorkflowCheckpoint = {
      ...buildCheckpoint(mismatchedState),
      // planId at the top level matches so the load succeeds, but inner planId differs
    }
    await store.save(checkpoint)

    const result = await resumer.resume(PLAN_ID, envelope)

    expect(result.resumed).toBe(false)
    expect(result.escalationReason).toBe('durability_fault')
  })
})

// ---------------------------------------------------------------------------
// ActionPolicy tests
// ---------------------------------------------------------------------------

describe('ActionPolicy — unsafe action rejection', () => {
  let policy: ActionPolicy

  beforeEach(() => {
    policy = new ActionPolicy()
  })

  it('rejects an action string not in the whitelist', () => {
    const decision = policy.evaluate('delete_everything')

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/not whitelisted/)
  })

  it('rejects an empty string action', () => {
    const decision = policy.evaluate('')

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/not whitelisted/)
  })

  it('allows every whitelisted MechanicAction', () => {
    const whitelistedActions: MechanicAction[] = [
      'start_container',
      'stop_container',
      'create_database',
      'create_repo',
      'attach_network',
      'generate_manifest',
      'deploy_gateway',
    ]

    for (const action of whitelistedActions) {
      const decision = policy.evaluate(action)
      expect(decision.allowed, `expected ${action} to be allowed`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// MechanicAuditLog tests
// ---------------------------------------------------------------------------

describe('MechanicAuditLog — valid action with audit recording', () => {
  let auditFilePath: string
  let auditLog: MechanicAuditLog

  beforeEach(() => {
    auditFilePath = join(tmpdir(), `mechanic-audit-test-${Date.now()}.jsonl`)
    auditLog = new MechanicAuditLog(auditFilePath)
  })

  afterEach(() => {
    if (existsSync(auditFilePath)) {
      unlinkSync(auditFilePath)
    }
  })

  it('records an accepted audit entry and retrieves it via list()', async () => {
    const record: MechanicAuditRecord = {
      requestId: 'req-001',
      tenantId: TENANT_ID,
      businessUnitId: 'bunit-001',
      action: 'start_container',
      status: 'accepted',
      timestamp: new Date().toISOString(),
    }

    await auditLog.record(record)
    const entries = await auditLog.list()

    expect(entries).toHaveLength(1)
    expect(entries[0]?.requestId).toBe('req-001')
    expect(entries[0]?.action).toBe('start_container')
    expect(entries[0]?.status).toBe('accepted')
  })

  it('records a rejected audit entry with a reason', async () => {
    const record: MechanicAuditRecord = {
      requestId: 'req-002',
      tenantId: TENANT_ID,
      businessUnitId: 'bunit-001',
      action: 'deploy_gateway',
      status: 'rejected',
      timestamp: new Date().toISOString(),
      reason: 'Action is not whitelisted: delete_everything',
    }

    await auditLog.record(record)
    const entries = await auditLog.list()

    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('rejected')
    expect(entries[0]?.reason).toBe('Action is not whitelisted: delete_everything')
  })

  it('returns empty list when audit file does not exist', async () => {
    // brand-new auditLog with a path that will never be written
    const freshLog = new MechanicAuditLog(join(tmpdir(), `nonexistent-${Date.now()}.jsonl`))
    const entries = await freshLog.list()

    expect(entries).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// End-to-end: ActionPolicy + MechanicAuditLog + MechanicRequestValidator
// ---------------------------------------------------------------------------

describe('Mechanic safety pipeline — end-to-end', () => {
  let policy: ActionPolicy
  let validator: MechanicRequestValidator
  let auditFilePath: string
  let auditLog: MechanicAuditLog

  beforeEach(() => {
    policy = new ActionPolicy()
    validator = new MechanicRequestValidator()
    auditFilePath = join(tmpdir(), `mechanic-e2e-${Date.now()}.jsonl`)
    auditLog = new MechanicAuditLog(auditFilePath)
  })

  afterEach(() => {
    if (existsSync(auditFilePath)) {
      unlinkSync(auditFilePath)
    }
  })

  it('rejects an unsafe action and records rejection in audit log', async () => {
    const unsafeAction = 'rm_all_data'
    const request: MechanicRequest = {
      requestId: 'req-unsafe-001',
      tenantId: TENANT_ID,
      businessUnitId: 'bunit-001',
      action: unsafeAction as MechanicAction,
      payload: { target: 'everywhere' },
      approvedByPlanId: PLAN_ID,
      requestedByAgentId: 'agent-worker-1',
    }

    const decision = policy.evaluate(request.action)

    expect(decision.allowed).toBe(false)

    await auditLog.record({
      requestId: request.requestId,
      tenantId: request.tenantId,
      businessUnitId: request.businessUnitId,
      action: 'stop_container', // use a real MechanicAction in the audit record type
      status: 'rejected',
      timestamp: new Date().toISOString(),
      reason: decision.reason,
    })

    const entries = await auditLog.list()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('rejected')
    expect(entries[0]?.reason).toMatch(/not whitelisted/)
  })

  it('approves a valid MechanicRequest and records execution in audit log', async () => {
    const request: MechanicRequest = {
      requestId: 'req-valid-001',
      tenantId: TENANT_ID,
      businessUnitId: 'bunit-001',
      action: 'stop_container',
      payload: { containerId: 'container-xyz' },
      approvedByPlanId: PLAN_ID,
      requestedByAgentId: 'agent-worker-2',
    }

    // Policy check
    const decision = policy.evaluate(request.action)
    expect(decision.allowed).toBe(true)

    // Payload validation
    const validation = validator.validate(request)
    expect(validation.valid).toBe(true)

    // Record execution
    await auditLog.record({
      requestId: request.requestId,
      tenantId: request.tenantId,
      businessUnitId: request.businessUnitId,
      action: request.action,
      status: 'executed',
      timestamp: new Date().toISOString(),
    })

    const entries = await auditLog.list()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.requestId).toBe('req-valid-001')
    expect(entries[0]?.action).toBe('stop_container')
    expect(entries[0]?.status).toBe('executed')
    expect(entries[0]?.reason).toBeUndefined()
  })

  it('validates payload fields and rejects malformed MechanicRequest', async () => {
    // stop_container requires { containerId: string } — we omit it to trigger validation failure
    const request: MechanicRequest = {
      requestId: 'req-bad-payload-001',
      tenantId: TENANT_ID,
      businessUnitId: 'bunit-001',
      action: 'stop_container',
      payload: { wrongField: 'oops' },
      approvedByPlanId: PLAN_ID,
      requestedByAgentId: 'agent-worker-3',
    }

    const decision = policy.evaluate(request.action)
    expect(decision.allowed).toBe(true) // action itself is allowed

    const validation = validator.validate(request)
    expect(validation.valid).toBe(false) // payload is invalid
    if (!validation.valid) {
      expect(validation.reason).toMatch(/stop_container/)
    }
  })

  it('MechanicRequestValidator rejects payload containing unsafe shell content', async () => {
    const request: MechanicRequest = {
      requestId: 'req-injection-001',
      tenantId: TENANT_ID,
      businessUnitId: 'bunit-001',
      action: 'stop_container',
      payload: { containerId: 'container-abc; rm -rf /' },
      approvedByPlanId: PLAN_ID,
      requestedByAgentId: 'agent-worker-4',
    }

    const validation = validator.validate(request)
    expect(validation.valid).toBe(false)
    if (!validation.valid) {
      expect(validation.reason).toMatch(/[Uu]nsafe/)
    }
  })
})
