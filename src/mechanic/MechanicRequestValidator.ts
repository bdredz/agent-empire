import { z } from 'zod'
import type { MechanicAction, MechanicRequest } from '@shared/types'

const CONTAINER_REQUEST_SCHEMA = z.object({
  businessId: z.string().min(1),
  image: z.string().min(1),
  envVars: z.record(z.string(), z.string()),
  resourceLimits: z.object({
    cpuShares: z.number().int().positive(),
    memoryMb: z.number().int().positive(),
    diskMb: z.number().int().positive(),
  }),
  networkPolicy: z.enum(['none', 'restricted', 'full']),
})

const DATABASE_REQUEST_SCHEMA = z.object({
  businessId: z.string().min(1),
  engine: z.literal('postgresql'),
  extensions: z.array(z.string()),
  maxConnections: z.number().int().positive(),
  maxSizeMb: z.number().int().positive(),
})

const REPO_REQUEST_SCHEMA = z.object({
  businessId: z.string().min(1),
  repoName: z.string().min(1),
  isPrivate: z.literal(true),
  templateRepo: z.string().optional(),
})

const REQUEST_SCHEMA = z.object({
  requestId: z.string().min(1),
  tenantId: z.string().min(1),
  businessUnitId: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  approvedByPlanId: z.string().min(1),
  requestedByAgentId: z.string().min(1),
})

const PAYLOAD_SCHEMAS: Record<MechanicAction, z.ZodType<unknown>> = {
  start_container: z.union([
    z.object({ containerId: z.string().min(1) }),
    CONTAINER_REQUEST_SCHEMA,
  ]),
  stop_container: z.object({ containerId: z.string().min(1) }),
  create_database: DATABASE_REQUEST_SCHEMA,
  create_repo: REPO_REQUEST_SCHEMA,
  attach_network: z.object({
    containerId: z.string().min(1),
    networkName: z.string().min(1),
  }),
  generate_manifest: z.object({
    serviceName: z.string().min(1),
    version: z.string().min(1),
    baseUrl: z.string().url(),
  }),
  deploy_gateway: z.object({
    serviceName: z.string().min(1),
    baseUrl: z.string().url(),
  }),
}

const UNSAFE_PATTERNS: RegExp[] = [
  /\b(rm\s+-rf|curl\s+|wget\s+|bash\s+|sh\s+|powershell\s+)\b/i,
  /[;&|`]/,
  /\$\(/,
]

export type ValidatedMechanicRequest = MechanicRequest

export type MechanicRequestValidationResult =
  | { readonly valid: true; readonly request: ValidatedMechanicRequest }
  | { readonly valid: false; readonly reason: string }

export class MechanicRequestValidator {
  public validate(request: MechanicRequest): MechanicRequestValidationResult {
    const parsedRequest = REQUEST_SCHEMA.safeParse(request)
    if (!parsedRequest.success) {
      const reason = parsedRequest.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return { valid: false, reason: `Invalid mechanic request: ${reason}` }
    }

    if (containsUnsafeContent(parsedRequest.data.payload)) {
      return { valid: false, reason: 'Unsafe content in payload' }
    }

    const payloadSchema = PAYLOAD_SCHEMAS[request.action as MechanicAction]
    if (!payloadSchema) {
      return { valid: false, reason: `Unsupported action payload schema: ${request.action}` }
    }

    const parsedPayload = payloadSchema.safeParse(parsedRequest.data.payload)
    if (!parsedPayload.success) {
      const reason = parsedPayload.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
      return { valid: false, reason: `Invalid payload for action ${request.action}: ${reason}` }
    }

    return {
      valid: true,
      request: {
        ...request,
        action: request.action as MechanicAction,
        payload: parsedPayload.data as Record<string, unknown>,
      },
    }
  }
}

function containsUnsafeContent(value: unknown): boolean {
  if (typeof value === 'string') {
    return UNSAFE_PATTERNS.some((pattern) => pattern.test(value))
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsUnsafeContent(item))
  }

  if (isRecord(value)) {
    return Object.values(value).some((item) => containsUnsafeContent(item))
  }

  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
