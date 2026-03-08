import { z } from 'zod'

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(8787),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Infrastructure (optional in dev, required in prod)
  githubToken: z.string().optional(),
  githubOrg: z.string().default('agent-empire'),
  databaseUrl: z.string().optional(),
  redisUrl: z.string().optional(),
  anthropicApiKey: z.string().optional(),

  // State persistence
  budgetStateFile: z.string().default('.data/governor-state.json'),
  mechanicStateFile: z.string().default('.data/mechanic-state.json'),

  // Jarvis
  jarvisApiUrl: z.string().default('http://localhost:8787'),

  // Dashboard
  nextPublicEventsWsUrl: z.string().default('ws://localhost:8787/events'),

  // Budget thresholds
  budgetWarningRatio: z.coerce.number().default(0.8),
  budgetTripRatio: z.coerce.number().default(0.95),

  // Librarian
  librarianDedupThreshold: z.coerce.number().default(0.9),
  librarianDefaultTtlSec: z.coerce.number().default(86400),
})

export type AppConfig = z.infer<typeof configSchema>

let _config: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (_config) return _config

  const result = configSchema.safeParse({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
    githubToken: process.env.GITHUB_TOKEN,
    githubOrg: process.env.GITHUB_ORG,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    budgetStateFile: process.env.BUDGET_GOVERNOR_STATE_FILE,
    mechanicStateFile: process.env.MECHANIC_STATE_FILE,
    jarvisApiUrl: process.env.JARVIS_API_URL,
    nextPublicEventsWsUrl: process.env.NEXT_PUBLIC_EVENTS_WS_URL,
    budgetWarningRatio: process.env.BUDGET_WARNING_RATIO,
    budgetTripRatio: process.env.BUDGET_TRIP_RATIO,
    librarianDedupThreshold: process.env.LIBRARIAN_DEDUP_THRESHOLD,
    librarianDefaultTtlSec: process.env.LIBRARIAN_DEFAULT_TTL_SEC,
  })

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid configuration:\n${errors}`)
  }

  _config = result.data
  return _config
}

export function getConfig(): AppConfig {
  if (!_config) return loadConfig()
  return _config
}

// Reset for testing
export function resetConfig(): void {
  _config = null
}
