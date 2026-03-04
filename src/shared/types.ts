// =============================================================================
// AGENT EMPIRE — CORE TYPE DEFINITIONS
// =============================================================================
// This file is the SINGLE SOURCE OF TRUTH for all data shapes in the system.
// Every component, every agent, every service imports from here.
// DO NOT define types inline elsewhere. Add them here first.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. IDENTITY & LINEAGE
// -----------------------------------------------------------------------------

export type AgentId = string & { readonly __brand: 'AgentId' }
export type TaskId = string & { readonly __brand: 'TaskId' }
export type RunId = string & { readonly __brand: 'RunId' }
export type ArtifactId = string & { readonly __brand: 'ArtifactId' }
export type BusinessId = string & { readonly __brand: 'BusinessId' }

export const createAgentId = (id: string): AgentId => id as AgentId
export const createTaskId = (id: string): TaskId => id as TaskId
export const createRunId = (id: string): RunId => id as RunId
export const createArtifactId = (id: string): ArtifactId => id as ArtifactId
export const createBusinessId = (id: string): BusinessId => id as BusinessId

export interface AgentLineage {
  readonly rootAgentId: AgentId
  readonly parentAgentId: AgentId | null
  readonly depth: number
  readonly spawnReason: string
  readonly lineageContextRefs: ArtifactId[]
}

// -----------------------------------------------------------------------------
// 2. AGENT ROLES & CAPABILITIES
// -----------------------------------------------------------------------------

export const AgentRole = {
  Orchestrator: 'orchestrator',
  Mechanic: 'mechanic',
  Librarian: 'librarian',
  Evaluator: 'evaluator',
  Researcher: 'researcher',
  Implementer: 'implementer',
  Marketer: 'marketer',
  RevenueOps: 'revenue_ops',
  HumanComms: 'human_comms',
  SecurityAuditor: 'security_auditor',
  Worker: 'worker',
} as const
export type AgentRole = typeof AgentRole[keyof typeof AgentRole]

export const Capability = {
  CodeGeneration: 'code_generation',
  CodeReview: 'code_review',
  UnitTesting: 'unit_testing',
  DocRetrieval: 'doc_retrieval',
  WebScraping: 'web_scraping',
  DataTransform: 'data_transform',
  ContentGeneration: 'content_generation',
  ApiIntegration: 'api_integration',
  DatabaseOps: 'database_ops',
  ContainerOps: 'container_ops',
  GitOps: 'git_ops',
  SemanticSearch: 'semantic_search',
  Summarization: 'summarization',
  HumanOutreach: 'human_outreach',
  StaticAnalysis: 'static_analysis',
  FinancialAnalysis: 'financial_analysis',
} as const
export type Capability = typeof Capability[keyof typeof Capability]

// -----------------------------------------------------------------------------
// 3. TOOL SYSTEM
// -----------------------------------------------------------------------------

export const ToolScope = {
  ReadOnly: 'read_only',
  ReadWrite: 'read_write',
  Execute: 'execute',
} as const
export type ToolScope = typeof ToolScope[keyof typeof ToolScope]

export interface ToolRef {
  readonly name: string
  readonly scope: ToolScope
  readonly permissions: string[]  // e.g. ['containers.create', 'containers.start']
  readonly rateLimitPerMin?: number
}

export const SandboxNetwork = {
  None: 'none',
  Restricted: 'restricted',
  Full: 'full',
} as const
export type SandboxNetwork = typeof SandboxNetwork[keyof typeof SandboxNetwork]

export interface SandboxConfig {
  readonly network: SandboxNetwork
  readonly allowedDomains?: string[]
  readonly filesystem: 'none' | 'ephemeral' | 'persistent'
  readonly maxDiskMb?: number
}

export interface ToolBundle {
  readonly tools: ToolRef[]
  readonly sandbox: SandboxConfig
}

// -----------------------------------------------------------------------------
// 4. RESOURCE BUDGETS
// -----------------------------------------------------------------------------

export interface Budget {
  readonly maxTokens: number
  readonly maxToolCalls: number
  readonly maxWallTimeSec: number
  readonly maxCostUnits?: number
  readonly maxRecursionDepth?: number
  readonly rateLimits?: Record<string, number>  // tool_name -> calls_per_min
}

export interface BudgetUsage {
  tokensUsed: number
  toolCallsUsed: number
  wallTimeElapsedSec: number
  costUnitsUsed: number
}

export interface BudgetCheckResult {
  readonly withinLimits: boolean
  readonly warnings: string[]
  readonly exceeded: string[]
}

export interface BudgetThresholdConfig {
  readonly warningRatio: number
  readonly tripRatio: number
}

export interface BudgetGovernorAgentState {
  readonly budget: Budget
  readonly usage: BudgetUsage
  readonly status: AgentStatus
  readonly circuitBreakerReason?: string
  readonly circuitBreakerTrippedAt?: string
  readonly budgetOverrideAttempts: number
}

export interface BudgetGovernorState {
  readonly agents: Record<string, BudgetGovernorAgentState>
  readonly events: SystemEvent[]
}

export const ChildBudgetPolicy = {
  InheritScaled: 'inherit_scaled',
  ExplicitOnly: 'explicit_only',
} as const
export type ChildBudgetPolicy = typeof ChildBudgetPolicy[keyof typeof ChildBudgetPolicy]

// -----------------------------------------------------------------------------
// 5. MEMORY POLICY
// -----------------------------------------------------------------------------

export const MemoryMode = {
  Stateless: 'stateless',
  Ephemeral: 'ephemeral',
  Persistent: 'persistent',
} as const
export type MemoryMode = typeof MemoryMode[keyof typeof MemoryMode]

export interface MemoryPolicy {
  readonly mode: MemoryMode
  readonly ephemeralTtlSec?: number
  readonly persistentNamespace?: string
  readonly allowedArtifactReads: string[]   // namespace patterns
  readonly allowedArtifactWrites: string[]  // namespace patterns
}

// -----------------------------------------------------------------------------
// 6. EVALUATION CONTRACTS
// -----------------------------------------------------------------------------

export const EvalMethod = {
  UnitTests: 'unit_tests',
  SchemaValidate: 'schema_validate',
  LlmCritic: 'llm_critic',
  Hybrid: 'hybrid',
  Deterministic: 'deterministic',
} as const
export type EvalMethod = typeof EvalMethod[keyof typeof EvalMethod]

export const EvalOutcome = {
  Pass: 'pass',
  Fail: 'fail',
  Retry: 'retry',
  Escalate: 'escalate',
} as const
export type EvalOutcome = typeof EvalOutcome[keyof typeof EvalOutcome]

export interface SelfCheck {
  readonly mustProduce: string[]    // e.g. ['diff', 'tests_passed_report']
  readonly format: 'json' | 'markdown' | 'artifact_refs'
  readonly confidenceRequired?: number  // 0.0 - 1.0
}

export interface EvalResult {
  readonly outcome: EvalOutcome
  readonly scores?: Record<string, number>
  readonly reasoning: string
  readonly artifactRefs?: ArtifactId[]
  readonly evaluatorId: string
  readonly timestamp: string  // ISO 8601
}

export interface SuccessCriteria {
  readonly description: string
  readonly evalMethod: EvalMethod
  readonly minConfidence?: number
  readonly requiredArtifacts?: string[]
  readonly customChecks?: string[]  // function names to run
}

// -----------------------------------------------------------------------------
// 7. SPAWN PERMISSIONS
// -----------------------------------------------------------------------------

export interface SpawnPermissions {
  readonly allowed: boolean
  readonly maxChildren: number
  readonly maxDepthFromRoot: number
  readonly allowedRoles: AgentRole[]
  readonly childBudgetPolicy: ChildBudgetPolicy
}

// -----------------------------------------------------------------------------
// 8. AGENT CREATION (Factory Input)
// -----------------------------------------------------------------------------

export interface CreateAgentRequest {
  // Identity
  readonly parentAgentId?: AgentId
  readonly spawnReason: string
  readonly lineageContextRefs?: ArtifactId[]

  // Role
  readonly roleName: AgentRole
  readonly objective: string
  readonly instructions: string  // system-level constraints

  // Capabilities
  readonly capabilities: Capability[]
  readonly requiredTools: ToolRef[]
  readonly disallowedTools?: string[]

  // Tool bundle
  readonly toolBundle: ToolBundle

  // Resources
  readonly budget: Budget

  // Memory
  readonly memoryPolicy: MemoryPolicy

  // Evaluation
  readonly selfCheck?: SelfCheck

  // Spawn permissions
  readonly spawnPermissions: SpawnPermissions

  // Model selection
  readonly modelTier: ModelTier
  readonly modelOverride?: string  // specific model string if needed
}

// -----------------------------------------------------------------------------
// 9. AGENT HANDLE (Factory Output)
// -----------------------------------------------------------------------------

export interface AgentHandle {
  readonly agentId: AgentId
  readonly roleName: AgentRole
  readonly createdAt: string  // ISO 8601
  readonly budgetAllocated: Budget
  readonly toolBundleResolved: ToolBundle
  readonly memoryPolicyResolved: MemoryPolicy
  readonly lineage: AgentLineage
  readonly provenanceHash: string  // hash of request + resolved config
  readonly status: AgentStatus
  readonly modelTier: ModelTier
}

export const AgentStatus = {
  Initializing: 'initializing',
  Ready: 'ready',
  Busy: 'busy',
  Paused: 'paused',
  Terminated: 'terminated',
  Error: 'error',
} as const
export type AgentStatus = typeof AgentStatus[keyof typeof AgentStatus]

// -----------------------------------------------------------------------------
// 10. TASK SYSTEM
// -----------------------------------------------------------------------------

export interface TaskSpec {
  readonly taskId: TaskId
  readonly taskType: string  // e.g. 'implement_feature', 'review', 'scrape'
  readonly inputs: TaskInputs
  readonly expectedOutputs: OutputSchema[]
  readonly successCriteria: SuccessCriteria
  readonly retryPolicy: RetryPolicy
  readonly deadline?: string  // ISO 8601
  readonly priority: TaskPriority
  readonly parentTaskId?: TaskId
  readonly businessId?: BusinessId
}

export interface TaskInputs {
  readonly artifactRefs: ArtifactId[]
  readonly parameters: Record<string, unknown>
  readonly contextFromHiveMind?: string[]  // query strings for vector search
}

export interface OutputSchema {
  readonly name: string
  readonly format: 'json' | 'markdown' | 'code' | 'binary' | 'artifact_ref'
  readonly schema?: Record<string, unknown>  // JSON schema if format is json
}

export interface RetryPolicy {
  readonly maxAttempts: number
  readonly backoffMs: number
  readonly jitter: boolean
  readonly escalateAfter: number  // escalate to parent after N failures
}

export const TaskPriority = {
  Critical: 'critical',
  High: 'high',
  Normal: 'normal',
  Low: 'low',
  Background: 'background',
} as const
export type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority]

// -----------------------------------------------------------------------------
// 11. TASK RUN (Execution Output)
// -----------------------------------------------------------------------------

export const TaskRunStatus = {
  Queued: 'queued',
  Running: 'running',
  Blocked: 'blocked',
  Succeeded: 'succeeded',
  Failed: 'failed',
  Terminated: 'terminated',
} as const
export type TaskRunStatus = typeof TaskRunStatus[keyof typeof TaskRunStatus]

export interface TaskRunHandle {
  readonly runId: RunId
  readonly agentId: AgentId
  readonly taskId: TaskId
  readonly status: TaskRunStatus
  readonly artifactsWritten: ArtifactId[]
  readonly logsRef: string  // pointer to structured logs
  readonly usage: BudgetUsage
  readonly evaluation?: EvalResult
  readonly terminationReason?: string
  readonly startedAt: string   // ISO 8601
  readonly completedAt?: string // ISO 8601
}

// -----------------------------------------------------------------------------
// 12. MODEL TIERS
// -----------------------------------------------------------------------------

export const ModelTier = {
  Frontier: 'frontier',   // Opus — strategic reasoning, orchestration
  Standard: 'standard',   // Sonnet — structured implementation
  Fast: 'fast',           // Haiku — deterministic micro-tasks
  Tiny: 'tiny',           // Smallest available — parsing, formatting
} as const
export type ModelTier = typeof ModelTier[keyof typeof ModelTier]

export interface ModelConfig {
  readonly tier: ModelTier
  readonly provider: string       // 'anthropic' | 'openai' | 'google' etc
  readonly modelString: string    // actual API model identifier
  readonly maxContextTokens: number
  readonly costPer1kInput: number
  readonly costPer1kOutput: number
}

// -----------------------------------------------------------------------------
// 13. BUSINESS UNIT
// -----------------------------------------------------------------------------

export const BusinessType = {
  AgentApi: 'agent_api',           // API/MCP server for other agents
  AgentMarketplace: 'agent_marketplace',
  DataService: 'data_service',
  ContentAutomation: 'content_automation',
  SaasProduct: 'saas_product',
  Custom: 'custom',
} as const
export type BusinessType = typeof BusinessType[keyof typeof BusinessType]

export interface BusinessUnit {
  readonly businessId: BusinessId
  readonly name: string
  readonly type: BusinessType
  readonly status: BusinessStatus
  readonly containerId?: string       // Docker container ID
  readonly databaseUrl?: string       // isolated PostgreSQL connection
  readonly repoUrl?: string           // private Git repo
  readonly assignedAgents: AgentId[]
  readonly createdAt: string
  readonly metrics: BusinessMetrics
}

export const BusinessStatus = {
  Provisioning: 'provisioning',
  Active: 'active',
  Paused: 'paused',
  Scaling: 'scaling',
  Decommissioning: 'decommissioning',
  Sold: 'sold',
} as const
export type BusinessStatus = typeof BusinessStatus[keyof typeof BusinessStatus]

export interface BusinessMetrics {
  readonly revenue30d: number
  readonly costs30d: number
  readonly activeAgents: number
  readonly totalTasksCompleted: number
  readonly failureRate: number  // 0.0 - 1.0
  readonly uptimePercent: number
}

// -----------------------------------------------------------------------------
// 14. HIVE MIND (Knowledge Base)
// -----------------------------------------------------------------------------

export interface KnowledgeEntry {
  readonly id: ArtifactId
  readonly content: string
  readonly embedding?: number[]  // vector for semantic search
  readonly source: KnowledgeSource
  readonly businessId?: BusinessId
  readonly tags: string[]
  readonly createdAt: string
  readonly expiresAt?: string
  readonly confidence: number  // 0.0 - 1.0
  readonly verifiedBy?: AgentId
}

export interface KnowledgeSource {
  readonly agentId: AgentId
  readonly taskId?: TaskId
  readonly sourceType: 'agent_output' | 'web_scrape' | 'user_input' | 'system'
  readonly url?: string
}

// -----------------------------------------------------------------------------
// 15. ORCHESTRATOR EVENTS (Dashboard & Logging)
// -----------------------------------------------------------------------------

export const EventType = {
  AgentCreated: 'agent.created',
  AgentTerminated: 'agent.terminated',
  TaskQueued: 'task.queued',
  TaskStarted: 'task.started',
  TaskCompleted: 'task.completed',
  TaskFailed: 'task.failed',
  EvalPassed: 'eval.passed',
  EvalFailed: 'eval.failed',
  EvalEscalated: 'eval.escalated',
  BudgetWarning: 'budget.warning',
  BudgetExceeded: 'budget.exceeded',
  CircuitBreakerTripped: 'circuit_breaker.tripped',
  BusinessProvisioned: 'business.provisioned',
  BusinessDecommissioned: 'business.decommissioned',
  HumanApprovalRequired: 'human.approval_required',
  HumanApprovalGranted: 'human.approval_granted',
  HumanApprovalDenied: 'human.approval_denied',
  KnowledgeIngested: 'knowledge.ingested',
  KnowledgeRejected: 'knowledge.rejected',
} as const
export type EventType = typeof EventType[keyof typeof EventType]

export interface SystemEvent {
  readonly eventId: string
  readonly eventType: EventType
  readonly timestamp: string  // ISO 8601
  readonly agentId?: AgentId
  readonly taskId?: TaskId
  readonly businessId?: BusinessId
  readonly payload: Record<string, unknown>
  readonly severity: 'info' | 'warning' | 'error' | 'critical'
}

// -----------------------------------------------------------------------------
// 16. HITL (Human-In-The-Loop) APPROVAL
// -----------------------------------------------------------------------------

export const ApprovalStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Denied: 'denied',
  Expired: 'expired',
} as const
export type ApprovalStatus = typeof ApprovalStatus[keyof typeof ApprovalStatus]

export interface HitlApproval {
  readonly approvalId: string
  readonly requestingAgentId: AgentId
  readonly action: string           // human-readable description of what needs approval
  readonly context: string          // why the agent needs this
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical'
  readonly status: ApprovalStatus
  readonly requestedAt: string
  readonly respondedAt?: string
  readonly expiresAt: string
  readonly payload: Record<string, unknown>  // the actual data/action to approve
}

// -----------------------------------------------------------------------------
// 17. MCP ENDPOINT CONTRACTS (Mechanic's Toolbelt)
// -----------------------------------------------------------------------------

export interface McpEndpoint {
  readonly name: string
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly path: string
  readonly description: string
  readonly requiredRole: AgentRole[]
  readonly requiresApproval: boolean
  readonly inputSchema: Record<string, unknown>
  readonly outputSchema: Record<string, unknown>
}

// Mechanic-specific MCP operations
export interface ContainerProvisionRequest {
  readonly businessId: BusinessId
  readonly image: string
  readonly envVars: Record<string, string>  // keys only, values from secrets manager
  readonly resourceLimits: {
    readonly cpuShares: number
    readonly memoryMb: number
    readonly diskMb: number
  }
  readonly networkPolicy: SandboxNetwork
}

export interface ContainerProvisionResult {
  readonly containerId: string
  readonly status: 'running' | 'failed'
  readonly endpoints: Record<string, string>  // service_name -> url
  readonly provisionedAt: string
}

export interface DatabaseProvisionRequest {
  readonly businessId: BusinessId
  readonly engine: 'postgresql'
  readonly extensions: string[]  // e.g. ['pgvector']
  readonly maxConnections: number
  readonly maxSizeMb: number
}

export interface DatabaseProvisionResult {
  readonly connectionString: string  // goes to secrets manager, never to agent memory
  readonly databaseName: string
  readonly status: 'ready' | 'failed'
}

export interface RepoProvisionRequest {
  readonly businessId: BusinessId
  readonly repoName: string
  readonly isPrivate: true  // always true, never public
  readonly templateRepo?: string
}

export interface RepoProvisionResult {
  readonly repoUrl: string
  readonly defaultBranch: string
  readonly status: 'created' | 'failed'
}
