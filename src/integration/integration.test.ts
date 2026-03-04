import { describe, it, expect, vi } from 'vitest'
import {
  AgentId,
  AgentRole,
  AgentStatus,
  Budget,
  BudgetUsage,
  BusinessId,
  BusinessStatus,
  BusinessType,
  BusinessUnit,
  Capability,
  ChildBudgetPolicy,
  ContainerProvisionRequest,
  ContainerProvisionResult,
  CreateAgentRequest,
  DatabaseProvisionRequest,
  DatabaseProvisionResult,
  EvalOutcome,
  EvalResult,
  MemoryMode,
  ModelTier,
  RepoProvisionRequest,
  RepoProvisionResult,
  SandboxNetwork,
  SystemEvent,
  TaskPriority,
  TaskSpec,
  ToolScope,
  createAgentId,
  createArtifactId,
  createBusinessId,
  createTaskId,
} from '@shared/types'

// -- Factory
import { AgentFactory } from '@factory/AgentFactory'
import { IAgentFactory, FactoryResult } from '@factory/IAgentFactory'

// -- Governor
import { BudgetGovernor } from '@governor/BudgetGovernor'
import { IBudgetGovernor } from '@governor/IBudgetGovernor'

// -- Eval
import { EvalPipeline } from '@eval/EvalPipeline'
import { DeterministicEvaluator, DeterministicCheck } from '@eval/DeterministicEvaluator'
import { LlmCriticEvaluator, LlmCriticProvider } from '@eval/LlmCriticEvaluator'
import { EscalationEvaluator, EscalationProvider } from '@eval/EscalationEvaluator'
import { EvalInput } from '@eval/IEvaluator'

// -- Orchestrator
import { Jarvis } from '@orchestrator/Jarvis'
import { GoalAnalyzer, GoalAnalysis, TaskExecutor, NodeExecutionResult } from '@orchestrator/IJarvis'
import { TaskDAG, DAGNodeStatus, ExecutionResult } from '@orchestrator/TaskDAG'
import { createA2AEnvelope, A2AMessageType } from '@orchestrator/A2AProtocol'
import { evaluateCompleteness, COMPLETENESS_FIELDS, CompletenessField } from '@orchestrator/systemPrompt'

// -- Mechanic
import { Mechanic } from '@mechanic/Mechanic'
import {
  IDockerProvisioner,
  IDatabaseProvisioner,
  IRepoProvisioner,
  ProvisionBusinessUnitRequest,
} from '@mechanic/IMechanic'

// -- Workers
import { IWorker, WorkerResult } from '@workers/IWorker'

// -- Librarian
import { Librarian } from '@librarian/Librarian'
import { ILibrarian } from '@librarian/ILibrarian'

// =============================================================================
// MOCK INFRASTRUCTURE — all external dependencies are mocked
// =============================================================================

function mockDockerProvisioner(): IDockerProvisioner {
  return {
    createContainer: vi.fn().mockResolvedValue({
      containerId: 'cnt-integration-test',
      status: 'running',
      endpoints: { api: 'http://localhost:8080' },
      provisionedAt: new Date().toISOString(),
    } satisfies ContainerProvisionResult),
    startContainer: vi.fn().mockResolvedValue(undefined),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    removeContainer: vi.fn().mockResolvedValue(undefined),
    getContainerStatus: vi.fn().mockResolvedValue('running'),
  }
}

function mockDatabaseProvisioner(): IDatabaseProvisioner {
  return {
    provisionDatabase: vi.fn().mockResolvedValue({
      connectionString: 'postgresql://test:test@localhost:5432/integration_test',
      databaseName: 'integration_test',
      status: 'ready',
    } satisfies DatabaseProvisionResult),
  }
}

function mockRepoProvisioner(): IRepoProvisioner {
  return {
    provisionRepo: vi.fn().mockResolvedValue({
      repoUrl: 'https://github.com/agent-empire/integration-test.git',
      defaultBranch: 'main',
      status: 'created',
    } satisfies RepoProvisionResult),
  }
}

function mockLlmCriticProvider(): LlmCriticProvider {
  return {
    evaluate: vi.fn().mockResolvedValue({
      pass: true,
      confidence: 0.9,
      reasoning: 'Output meets quality standards',
      scores: { quality: 0.9, completeness: 0.85 },
    }),
  }
}

function mockEscalationProvider(): EscalationProvider {
  return {
    evaluate: vi.fn().mockResolvedValue({
      pass: true,
      confidence: 0.95,
      reasoning: 'No escalation needed',
      recommendation: 'accept',
      scores: { quality: 0.95 },
    }),
  }
}

/** Build a standard root agent creation request */
function rootAgentRequest(overrides: Partial<CreateAgentRequest> = {}): CreateAgentRequest {
  return {
    spawnReason: 'Integration test root agent',
    roleName: AgentRole.Orchestrator,
    objective: 'Orchestrate the integration test',
    instructions: 'Follow test script',
    capabilities: [Capability.CodeGeneration, Capability.ApiIntegration],
    requiredTools: [
      { name: 'code_gen', scope: ToolScope.ReadWrite, permissions: ['write'] },
      { name: 'api_call', scope: ToolScope.Execute, permissions: ['call'] },
    ],
    toolBundle: {
      tools: [
        { name: 'code_gen', scope: ToolScope.ReadWrite, permissions: ['write'] },
        { name: 'api_call', scope: ToolScope.Execute, permissions: ['call'] },
      ],
      sandbox: { network: SandboxNetwork.Restricted, filesystem: 'ephemeral' },
    },
    budget: {
      maxTokens: 100_000,
      maxToolCalls: 500,
      maxWallTimeSec: 3600,
      maxCostUnits: 10,
    },
    memoryPolicy: {
      mode: MemoryMode.Ephemeral,
      ephemeralTtlSec: 3600,
      allowedArtifactReads: ['*'],
      allowedArtifactWrites: ['test/*'],
    },
    spawnPermissions: {
      allowed: true,
      maxChildren: 10,
      maxDepthFromRoot: 5,
      allowedRoles: [AgentRole.Worker, AgentRole.Evaluator],
      childBudgetPolicy: ChildBudgetPolicy.InheritScaled,
    },
    modelTier: ModelTier.Frontier,
    ...overrides,
  }
}

// =============================================================================
// INTEGRATION TESTS — end-to-end flows through multiple components
// =============================================================================

describe('Phase 11: Integration — End-to-End Flows', () => {
  // =========================================================================
  // Flow 1: Agent Provisioning → Budget Allocation
  // Factory creates agent → Governor allocates budget → budget check passes
  // =========================================================================

  describe('Flow 1: Agent Lifecycle — Factory + Budget Governor', () => {
    it('should create agent via Factory and allocate budget via Governor', async () => {
      const factory = new AgentFactory()
      const governor = new BudgetGovernor()

      // Step 1: Create root agent
      const result = await factory.createAgent(rootAgentRequest())
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')

      const agent = result.value
      expect(agent.status).toBe(AgentStatus.Initializing)
      expect(agent.roleName).toBe(AgentRole.Orchestrator)

      // Step 2: Allocate budget
      governor.allocate(agent.agentId, agent.budgetAllocated)

      // Step 3: Check budget — should be within limits
      const budgetCheck = governor.checkBudget(agent.agentId)
      expect(budgetCheck.withinLimits).toBe(true)
      expect(budgetCheck.warnings).toHaveLength(0)

      // Step 4: Record some usage
      governor.recordUsage(agent.agentId, {
        tokensUsed: 5000,
        toolCallsUsed: 10,
        wallTimeElapsedSec: 30,
        costUnitsUsed: 0.5,
      })

      // Step 5: Still within limits
      const check2 = governor.checkBudget(agent.agentId)
      expect(check2.withinLimits).toBe(true)

      // Step 6: Record usage that exceeds budget
      governor.recordUsage(agent.agentId, {
        tokensUsed: 100_000,
        toolCallsUsed: 500,
      })

      const check3 = governor.checkBudget(agent.agentId)
      expect(check3.withinLimits).toBe(false)
    })

    it('should enforce child budget <= parent budget', async () => {
      const factory = new AgentFactory()

      // Create root agent
      const rootResult = await factory.createAgent(rootAgentRequest())
      expect(rootResult.ok).toBe(true)
      if (!rootResult.ok) throw new Error('unreachable')

      // Create child that exceeds parent budget
      const childResult = await factory.createAgent({
        ...rootAgentRequest({
          parentAgentId: rootResult.value.agentId,
          roleName: AgentRole.Worker,
          spawnReason: 'Child worker',
          budget: {
            maxTokens: 200_000, // exceeds parent's 100_000
            maxToolCalls: 500,
            maxWallTimeSec: 3600,
          },
        }),
      })

      expect(childResult.ok).toBe(false)
      if (childResult.ok) throw new Error('unreachable')
      expect(childResult.error).toBe('BUDGET_EXCEEDS_PARENT')
    })
  })

  // =========================================================================
  // Flow 2: Mechanic provisions business → Factory creates worker for it
  // =========================================================================

  describe('Flow 2: Business Provisioning — Mechanic + Factory', () => {
    it('should provision a business unit end-to-end', async () => {
      const docker = mockDockerProvisioner()
      const db = mockDatabaseProvisioner()
      const repo = mockRepoProvisioner()
      const stateFile = `/tmp/mechanic-integration-${Date.now()}.json`
      const mechanic = new Mechanic(docker, db, repo, stateFile)

      const businessId = createBusinessId('biz-integration-1')

      const request: ProvisionBusinessUnitRequest = {
        businessId,
        name: 'Test Integration Business',
        type: BusinessType.AgentApi,
        container: {
          businessId,
          image: 'node:20-slim',
          envVars: { NODE_ENV: 'production' },
          resourceLimits: { cpuShares: 1024, memoryMb: 512, diskMb: 1024 },
          networkPolicy: SandboxNetwork.Restricted,
        },
        database: {
          businessId,
          engine: 'postgresql',
          extensions: ['pgvector'],
          maxConnections: 20,
          maxSizeMb: 1024,
        },
        repo: {
          businessId,
          repoName: 'integration-test',
          isPrivate: true as const,
          templateRepo: 'agent-api-template',
        },
      }

      const business = await mechanic.provisionBusinessUnit(request)

      expect(business.businessId).toBe(businessId)
      expect(business.name).toBe('Test Integration Business')
      expect(business.type).toBe(BusinessType.AgentApi)
      expect(business.containerId).toBeDefined()
      // Note: Mechanic stores repoUrl but not databaseUrl (connection string goes to secrets manager)
      expect(business.repoUrl).toBeDefined()

      // Verify provisioners were called (Mechanic calls create, not start separately)
      expect(docker.createContainer).toHaveBeenCalled()
      expect(db.provisionDatabase).toHaveBeenCalled()
      expect(repo.provisionRepo).toHaveBeenCalled()

      // Verify events were logged
      const events = await mechanic.listEvents()
      expect(events.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // Flow 3: Jarvis goal → DAG → execution → eval
  // =========================================================================

  describe('Flow 3: Orchestration — Jarvis + Eval Pipeline', () => {
    it('should process goal, build DAG, execute, and evaluate results', async () => {
      // Build a TaskDAG the analyzer will return
      const dag: TaskDAG = {
        goalId: 'integration-goal-1',
        goalDescription: 'Provision a new agent-only business',
        nodes: [
          {
            taskId: createTaskId('t1'),
            name: 'Provision infrastructure',
            description: 'Set up container, DB, and repo',
            assignedRole: AgentRole.Mechanic,
            dependencies: [],
            priority: TaskPriority.High,
            status: DAGNodeStatus.Pending,
          },
          {
            taskId: createTaskId('t2'),
            name: 'Create worker agent',
            description: 'Spawn a worker to operate the business',
            assignedRole: AgentRole.Worker,
            dependencies: [createTaskId('t1')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
          {
            taskId: createTaskId('t3'),
            name: 'Validate deployment',
            description: 'Run health checks and eval',
            assignedRole: AgentRole.Evaluator,
            dependencies: [createTaskId('t1'), createTaskId('t2')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
        ],
        createdAt: new Date().toISOString(),
      }

      // GoalAnalyzer returns fully-specified analysis
      const fullFields: Partial<Record<CompletenessField, string | null>> = {}
      for (const f of COMPLETENESS_FIELDS) {
        fullFields[f] = `test-value-${f}`
      }
      const analysis: GoalAnalysis = {
        fields: fullFields,
        suggestedTasks: ['provision', 'deploy', 'validate'],
        estimatedComplexity: 'medium',
      }
      const analyzer: GoalAnalyzer = {
        analyzeGoal: vi.fn().mockResolvedValue(analysis),
        decomposeGoal: vi.fn().mockResolvedValue(dag),
      }

      // TaskExecutor succeeds on all nodes
      const executor: TaskExecutor = {
        executeNode: vi.fn().mockResolvedValue({ success: true } satisfies NodeExecutionResult),
      }

      const jarvis = new Jarvis(analyzer, executor)

      // Step 1: Process goal → should return DAG (not clarification)
      const goalResult = await jarvis.processGoal('Provision a new agent-only business')
      expect('nodes' in goalResult).toBe(true)
      const resultDag = goalResult as TaskDAG
      expect(resultDag.nodes).toHaveLength(3)

      // Step 2: Execute the DAG
      const execResult = await jarvis.executeDAG(resultDag)
      expect(execResult.status).toBe('completed')
      expect(execResult.completedNodes).toHaveLength(3)
      expect(execResult.failedNodes).toHaveLength(0)

      // Step 3: Evaluate the output via EvalPipeline
      const deterministicChecks: DeterministicCheck[] = [
        {
          name: 'all-tasks-completed',
          check: (output: unknown) => {
            const result = output as ExecutionResult
            return result.status === 'completed'
          },
          errorMessage: 'Not all tasks completed',
        },
      ]
      const deterministicEval = new DeterministicEvaluator(deterministicChecks, [])
      const llmCritic = new LlmCriticEvaluator(mockLlmCriticProvider())
      const escalation = new EscalationEvaluator(mockEscalationProvider())

      const pipeline = new EvalPipeline(deterministicEval, llmCritic, escalation)

      const evalInput: EvalInput = {
        taskType: 'business_provisioning',
        artifacts: [createArtifactId('deployment-manifest')],
        output: execResult,
      }

      const pipelineResult = await pipeline.evaluate(evalInput)
      expect(pipelineResult.finalResult.outcome).toBe(EvalOutcome.Pass)
      // Pipeline flow: deterministic pass → llm_critic pass → returns at llm_critic stage
      expect(pipelineResult.stage).toBe('llm_critic')
    })

    it('should trigger clarification for underspecified goals', async () => {
      const sparseFields: Partial<Record<CompletenessField, string | null>> = {
        objective: 'Do something',
        // only 1 of 10 → 10% < 70%
      }
      const analysis: GoalAnalysis = {
        fields: sparseFields,
        suggestedTasks: [],
        estimatedComplexity: 'low',
      }
      const analyzer: GoalAnalyzer = {
        analyzeGoal: vi.fn().mockResolvedValue(analysis),
        decomposeGoal: vi.fn(),
      }
      const executor: TaskExecutor = {
        executeNode: vi.fn(),
      }

      const jarvis = new Jarvis(analyzer, executor)
      const result = await jarvis.processGoal('Do something vague')

      expect('questions' in result).toBe(true)
      expect('missingFields' in result).toBe(true)
      // Analyzer should NOT have been asked to decompose
      expect(analyzer.decomposeGoal).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // Flow 4: Escalation handling through Jarvis + Eval
  // =========================================================================

  describe('Flow 4: Escalation — Eval failure → Jarvis escalation handler', () => {
    it('should retry on partial progress, abort on total failure', async () => {
      const jarvis = new Jarvis(
        { analyzeGoal: vi.fn(), decomposeGoal: vi.fn() },
        { executeNode: vi.fn() }
      )

      // Partial progress → retry
      const partialResult: EvalResult = {
        outcome: EvalOutcome.Fail,
        reasoning: 'Close but not quite',
        scores: { quality: 0.7, completeness: 0.6 },
        evaluatorId: 'integration-eval',
        timestamp: new Date().toISOString(),
      }
      const retryResolution = await jarvis.handleEscalation(partialResult)
      expect(retryResolution.action).toBe('retry')
      expect(retryResolution.resolved).toBe(true)

      // Total failure → abort
      const totalFailResult: EvalResult = {
        outcome: EvalOutcome.Fail,
        reasoning: 'Complete failure',
        scores: { quality: 0.1, completeness: 0.0 },
        evaluatorId: 'integration-eval',
        timestamp: new Date().toISOString(),
      }
      const abortResolution = await jarvis.handleEscalation(totalFailResult)
      expect(abortResolution.action).toBe('abort')
      expect(abortResolution.resolved).toBe(false)

      // Escalation → hitl
      const escalateResult: EvalResult = {
        outcome: EvalOutcome.Escalate,
        reasoning: 'Need human',
        evaluatorId: 'integration-eval',
        timestamp: new Date().toISOString(),
      }
      const hitlResolution = await jarvis.handleEscalation(escalateResult)
      expect(hitlResolution.action).toBe('hitl')
    })
  })

  // =========================================================================
  // Flow 5: A2A Protocol — cross-agent message exchange
  // =========================================================================

  describe('Flow 5: Inter-Agent Communication — A2A Protocol', () => {
    it('should create valid envelope for task assignment and result', () => {
      const orchestratorId = createAgentId('jarvis-1')
      const workerId = createAgentId('worker-1')
      const taskId = createTaskId('task-integration-1')

      // Jarvis assigns task to worker
      const assignment = createA2AEnvelope(
        A2AMessageType.TaskAssignment,
        orchestratorId,
        workerId,
        {
          type: 'task.assignment',
          taskDescription: 'Provision infrastructure for new business',
          inputs: [createArtifactId('business-spec')],
          priority: 'high',
        },
        { taskId }
      )

      expect(assignment.messageType).toBe('task.assignment')
      expect(assignment.fromAgentId).toBe(orchestratorId)
      expect(assignment.toAgentId).toBe(workerId)
      expect(assignment.taskId).toBe(taskId)

      // Worker returns result
      const result = createA2AEnvelope(
        A2AMessageType.TaskResult,
        workerId,
        orchestratorId,
        {
          type: 'task.result',
          success: true,
          artifacts: [createArtifactId('infra-manifest')],
          summary: 'Infrastructure provisioned successfully',
        },
        { taskId, correlationId: assignment.messageId }
      )

      expect(result.messageType).toBe('task.result')
      expect(result.correlationId).toBe(assignment.messageId)
    })
  })

  // =========================================================================
  // Flow 6: Full pipeline — Goal → Factory → Governor → Execute → Eval
  // =========================================================================

  describe('Flow 6: Full Pipeline — Provision a new agent-only business', () => {
    it('should flow from goal through all components', async () => {
      // ------- Set up all components -------

      // 1. Factory + Governor
      const factory = new AgentFactory()
      const governor = new BudgetGovernor()

      // 2. Mechanic with mock provisioners
      const mechanicStateFile = `/tmp/mechanic-flow6-${Date.now()}.json`
      const mechanic = new Mechanic(
        mockDockerProvisioner(),
        mockDatabaseProvisioner(),
        mockRepoProvisioner(),
        mechanicStateFile
      )

      // 3. Create root orchestrator agent
      const rootResult = await factory.createAgent(rootAgentRequest())
      expect(rootResult.ok).toBe(true)
      if (!rootResult.ok) throw new Error('unreachable')
      const orchestratorAgent = rootResult.value

      // 4. Allocate budget
      governor.allocate(orchestratorAgent.agentId, orchestratorAgent.budgetAllocated)

      // 5. Create a worker child agent
      const workerResult = await factory.createAgent(rootAgentRequest({
        parentAgentId: orchestratorAgent.agentId,
        roleName: AgentRole.Worker,
        spawnReason: 'Worker for business operations',
        budget: {
          maxTokens: 50_000,
          maxToolCalls: 200,
          maxWallTimeSec: 1800,
        },
        spawnPermissions: {
          allowed: false,
          maxChildren: 0,
          maxDepthFromRoot: 5,
          allowedRoles: [],
          childBudgetPolicy: ChildBudgetPolicy.ExplicitOnly,
        },
        modelTier: ModelTier.Fast,
      }))
      expect(workerResult.ok).toBe(true)
      if (!workerResult.ok) throw new Error('unreachable')
      const workerAgent = workerResult.value

      // Verify lineage
      expect(workerAgent.lineage.parentAgentId).toBe(orchestratorAgent.agentId)
      expect(workerAgent.lineage.depth).toBe(1)

      // 6. Allocate worker budget
      governor.allocate(workerAgent.agentId, workerAgent.budgetAllocated)

      // 7. Provision business via Mechanic
      const pipelineBizId = createBusinessId('biz-full-pipeline')
      const business = await mechanic.provisionBusinessUnit({
        businessId: pipelineBizId,
        name: 'Full Pipeline Test Business',
        type: BusinessType.SaasProduct,
        container: {
          businessId: pipelineBizId,
          image: 'node:20-slim',
          envVars: { NODE_ENV: 'production' },
          resourceLimits: { cpuShares: 2048, memoryMb: 1024, diskMb: 2048 },
          networkPolicy: SandboxNetwork.Restricted,
        },
        database: {
          businessId: pipelineBizId,
          engine: 'postgresql',
          extensions: ['pgvector', 'uuid-ossp'],
          maxConnections: 50,
          maxSizeMb: 2048,
        },
        repo: {
          businessId: pipelineBizId,
          repoName: 'full-pipeline-test',
          isPrivate: true as const,
          templateRepo: 'saas-template',
        },
      })

      expect(business.status).toBe(BusinessStatus.Active)

      // 8. Build and execute DAG via Jarvis
      const dag: TaskDAG = {
        goalId: 'full-pipeline-goal',
        goalDescription: 'Full pipeline integration test',
        nodes: [
          {
            taskId: createTaskId('provision'),
            name: 'Provision infrastructure',
            description: 'Docker + DB + Repo',
            assignedRole: AgentRole.Mechanic,
            dependencies: [],
            priority: TaskPriority.Critical,
            status: DAGNodeStatus.Pending,
          },
          {
            taskId: createTaskId('deploy'),
            name: 'Deploy application',
            description: 'Deploy to provisioned container',
            assignedRole: AgentRole.Worker,
            dependencies: [createTaskId('provision')],
            priority: TaskPriority.High,
            status: DAGNodeStatus.Pending,
          },
        ],
        createdAt: new Date().toISOString(),
      }

      const executor: TaskExecutor = {
        executeNode: vi.fn().mockResolvedValue({ success: true }),
      }

      const fullAnalysisFields: Partial<Record<CompletenessField, string | null>> = {}
      for (const f of COMPLETENESS_FIELDS) {
        fullAnalysisFields[f] = 'filled'
      }
      const analyzer: GoalAnalyzer = {
        analyzeGoal: vi.fn().mockResolvedValue({
          fields: fullAnalysisFields,
          suggestedTasks: ['provision', 'deploy'],
          estimatedComplexity: 'medium',
        }),
        decomposeGoal: vi.fn().mockResolvedValue(dag),
      }

      const jarvis = new Jarvis(analyzer, executor)
      const dagResult = await jarvis.processGoal('Provision a SaaS business')
      expect('nodes' in dagResult).toBe(true)

      const execResult = await jarvis.executeDAG(dagResult as TaskDAG)
      expect(execResult.status).toBe('completed')

      // 9. Evaluate via pipeline
      const pipeline = new EvalPipeline(
        new DeterministicEvaluator(
          [{ name: 'completed', check: (output: unknown) => (output as ExecutionResult).status === 'completed', errorMessage: 'Not complete' }],
          []
        ),
        new LlmCriticEvaluator(mockLlmCriticProvider()),
        new EscalationEvaluator(mockEscalationProvider())
      )

      const evalResult = await pipeline.evaluate({
        taskType: 'full_pipeline',
        artifacts: [],
        output: execResult,
      })

      expect(evalResult.finalResult.outcome).toBe(EvalOutcome.Pass)

      // 10. Record budget usage for orchestrator
      governor.recordUsage(orchestratorAgent.agentId, {
        tokensUsed: 10_000,
        toolCallsUsed: 25,
        wallTimeElapsedSec: 60,
        costUnitsUsed: 1.0,
      })

      const finalCheck = governor.checkBudget(orchestratorAgent.agentId)
      expect(finalCheck.withinLimits).toBe(true)

      // 11. Verify agent listing
      const allAgents = await factory.listAgents()
      expect(allAgents.length).toBe(2) // orchestrator + worker

      // 12. Terminate worker
      const termResult = await factory.terminateAgent(
        workerAgent.agentId,
        'Pipeline complete'
      )
      expect(termResult.ok).toBe(true)
    })
  })

  // =========================================================================
  // Flow 7: Completeness Matrix sanity check across modules
  // =========================================================================

  describe('Flow 7: Completeness Matrix — system-wide consistency', () => {
    it('should evaluate completeness consistently across thresholds', () => {
      // 10 fields total, threshold is 0.7 (7 fields needed)
      const fields: Partial<Record<CompletenessField, string | null>> = {}

      // Fill exactly 7 fields
      for (let i = 0; i < 7; i++) {
        fields[COMPLETENESS_FIELDS[i]!] = `value-${i}`
      }

      const result = evaluateCompleteness(fields)
      expect(result.completenessRatio).toBeCloseTo(0.7)
      expect(result.filledCount).toBe(7)
      expect(result.totalFields).toBe(10)

      // Empty string counts as unfilled
      const withEmpty = { ...fields, objective: '' }
      const result2 = evaluateCompleteness(withEmpty)
      expect(result2.filledCount).toBe(6)
      expect(result2.completenessRatio).toBeCloseTo(0.6)
    })
  })

  // =========================================================================
  // Flow 8: DAG failure cascading through the full system
  // =========================================================================

  describe('Flow 8: Failure Cascading — DAG failure → escalation → resolution', () => {
    it('should cascade failure, skip downstream, and handle escalation', async () => {
      const dag: TaskDAG = {
        goalId: 'failure-cascade-test',
        goalDescription: 'Test failure cascading',
        nodes: [
          {
            taskId: createTaskId('step-1'),
            name: 'Initial setup',
            description: 'Should succeed',
            assignedRole: AgentRole.Mechanic,
            dependencies: [],
            priority: TaskPriority.High,
            status: DAGNodeStatus.Pending,
          },
          {
            taskId: createTaskId('step-2'),
            name: 'Failing step',
            description: 'This will fail',
            assignedRole: AgentRole.Worker,
            dependencies: [createTaskId('step-1')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
          {
            taskId: createTaskId('step-3'),
            name: 'Downstream (skipped)',
            description: 'Should be skipped due to step-2 failure',
            assignedRole: AgentRole.Evaluator,
            dependencies: [createTaskId('step-2')],
            priority: TaskPriority.Normal,
            status: DAGNodeStatus.Pending,
          },
        ],
        createdAt: new Date().toISOString(),
      }

      // step-2 is index 1 in the nodes array
      const executor: TaskExecutor = {
        executeNode: vi.fn().mockImplementation(
          (_dag: TaskDAG, nodeIndex: number) =>
            Promise.resolve(
              nodeIndex === 1
                ? { success: false, errorMessage: 'Deployment failed' }
                : { success: true }
            )
        ),
      }

      const jarvis = new Jarvis(
        { analyzeGoal: vi.fn(), decomposeGoal: vi.fn() },
        executor
      )

      const result = await jarvis.executeDAG(dag)

      expect(result.status).toBe('partial')
      expect(result.completedNodes).toHaveLength(1) // step-1
      expect(result.failedNodes).toHaveLength(1)    // step-2
      expect(result.skippedNodes).toHaveLength(1)   // step-3

      // Now handle the eval result from the failed step
      const failEval: EvalResult = {
        outcome: EvalOutcome.Fail,
        reasoning: 'Deployment failed with exit code 1',
        scores: { quality: 0.0, completeness: 0.3 },
        evaluatorId: 'deterministic',
        timestamp: new Date().toISOString(),
      }

      const resolution = await jarvis.handleEscalation(failEval)
      expect(resolution.action).toBe('abort')
      expect(resolution.resolved).toBe(false)
    })
  })
})
