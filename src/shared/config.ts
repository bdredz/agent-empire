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

  // Runtime durability
  checkpointStoreType: z.enum(['postgres', 'redis', 'none']).default('none'),
  checkpointTtlMs: z.coerce.number().default(3600000),
  waitConditionPollIntervalMs: z.coerce.number().default(5000),

  // Phase 3 — Trust
  trustAuditLogPath: z.string().default('.data/trust-audit.jsonl'),
  defaultTrustLevel: z.coerce.number().min(0).max(4).default(1),
  mandateDefaultExpiryMs: z.coerce.number().default(86400000), // 24h

  // Phase 3 — Evidence
  researchMaxSources: z.coerce.number().default(5),
  researchDefaultFreshness: z.enum(['realtime', 'recent', 'any']).default('recent'),
  evidenceStorePath: z.string().default('.data/evidence-store.jsonl'),

  // Phase 3 — Commerce
  defaultPaymentRail: z.enum(['stripe', 'x402', 'coinbase', 'mcp_pay', 'ap2']).default('stripe'),
  quoteExpiryMs: z.coerce.number().default(900000), // 15 min
  autoRefundThreshold: z.coerce.number().default(50),
  manualReviewThreshold: z.coerce.number().default(500),

  // Phase 3 — Wallet
  walletDefaultMaxPerTransaction: z.coerce.number().default(100),
  walletDefaultMaxDailyOutflow: z.coerce.number().default(1000),

  // Phase 3 — Gateway
  gatewayRateLimitTrusted: z.coerce.number().default(1000),
  gatewayRateLimitWatch: z.coerce.number().default(100),
  gatewayRateLimitUnknown: z.coerce.number().default(20),
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
    checkpointStoreType: process.env.CHECKPOINT_STORE_TYPE,
    checkpointTtlMs: process.env.CHECKPOINT_TTL_MS,
    waitConditionPollIntervalMs: process.env.WAIT_CONDITION_POLL_INTERVAL_MS,
    // Phase 3
    trustAuditLogPath: process.env.TRUST_AUDIT_LOG_PATH,
    defaultTrustLevel: process.env.DEFAULT_TRUST_LEVEL,
    mandateDefaultExpiryMs: process.env.MANDATE_DEFAULT_EXPIRY_MS,
    researchMaxSources: process.env.RESEARCH_MAX_SOURCES,
    researchDefaultFreshness: process.env.RESEARCH_DEFAULT_FRESHNESS,
    evidenceStorePath: process.env.EVIDENCE_STORE_PATH,
    defaultPaymentRail: process.env.DEFAULT_PAYMENT_RAIL,
    quoteExpiryMs: process.env.QUOTE_EXPIRY_MS,
    autoRefundThreshold: process.env.AUTO_REFUND_THRESHOLD,
    manualReviewThreshold: process.env.MANUAL_REVIEW_THRESHOLD,
    walletDefaultMaxPerTransaction: process.env.WALLET_DEFAULT_MAX_PER_TRANSACTION,
    walletDefaultMaxDailyOutflow: process.env.WALLET_DEFAULT_MAX_DAILY_OUTFLOW,
    gatewayRateLimitTrusted: process.env.GATEWAY_RATE_LIMIT_TRUSTED,
    gatewayRateLimitWatch: process.env.GATEWAY_RATE_LIMIT_WATCH,
    gatewayRateLimitUnknown: process.env.GATEWAY_RATE_LIMIT_UNKNOWN,
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
