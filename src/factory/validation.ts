import { z } from 'zod'
import {
  AgentRole,
  Capability,
  ToolScope,
  SandboxNetwork,
  MemoryMode,
  ChildBudgetPolicy,
  EvalMethod,
  ModelTier,
} from '@shared/types'

// ---------------------------------------------------------------------------
// Zod schemas for CreateAgentRequest validation
// ---------------------------------------------------------------------------

const toolRefSchema = z.object({
  name: z.string().min(1),
  scope: z.nativeEnum(ToolScope),
  permissions: z.array(z.string()),
  rateLimitPerMin: z.number().positive().optional(),
})

const sandboxConfigSchema = z.object({
  network: z.nativeEnum(SandboxNetwork),
  allowedDomains: z.array(z.string()).optional(),
  filesystem: z.enum(['none', 'ephemeral', 'persistent']),
  maxDiskMb: z.number().positive().optional(),
})

const toolBundleSchema = z.object({
  tools: z.array(toolRefSchema),
  sandbox: sandboxConfigSchema,
})

const budgetSchema = z.object({
  maxTokens: z.number().positive(),
  maxToolCalls: z.number().positive(),
  maxWallTimeSec: z.number().positive(),
  maxCostUnits: z.number().positive().optional(),
  maxRecursionDepth: z.number().int().min(1).optional(),
  rateLimits: z.record(z.string(), z.number()).optional(),
})

const memoryPolicySchema = z.object({
  mode: z.nativeEnum(MemoryMode),
  ephemeralTtlSec: z.number().positive().optional(),
  persistentNamespace: z.string().optional(),
  allowedArtifactReads: z.array(z.string()),
  allowedArtifactWrites: z.array(z.string()),
})

const selfCheckSchema = z.object({
  mustProduce: z.array(z.string()),
  format: z.enum(['json', 'markdown', 'artifact_refs']),
  confidenceRequired: z.number().min(0).max(1).optional(),
})

const spawnPermissionsSchema = z.object({
  allowed: z.boolean(),
  maxChildren: z.number().int().min(0),
  maxDepthFromRoot: z.number().int().min(1),
  allowedRoles: z.array(z.nativeEnum(AgentRole)),
  childBudgetPolicy: z.nativeEnum(ChildBudgetPolicy),
})

export const createAgentRequestSchema = z.object({
  parentAgentId: z.string().optional(),
  spawnReason: z.string().min(1),
  lineageContextRefs: z.array(z.string()).optional(),
  roleName: z.nativeEnum(AgentRole),
  objective: z.string().min(1),
  instructions: z.string().min(1),
  capabilities: z.array(z.nativeEnum(Capability)),
  requiredTools: z.array(toolRefSchema),
  disallowedTools: z.array(z.string()).optional(),
  toolBundle: toolBundleSchema,
  budget: budgetSchema,
  memoryPolicy: memoryPolicySchema,
  selfCheck: selfCheckSchema.optional(),
  spawnPermissions: spawnPermissionsSchema,
  modelTier: z.nativeEnum(ModelTier),
  modelOverride: z.string().optional(),
})

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] }

export function validateCreateAgentRequest(data: unknown): ValidationResult {
  const result = createAgentRequestSchema.safeParse(data)
  if (result.success) {
    return { valid: true }
  }
  return {
    valid: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    ),
  }
}
