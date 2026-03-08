import { serve } from '@hono/node-server'
import { loadConfig } from '@shared/config'
import { logger } from '@shared/logger'
import { createContainer } from './server/container'
import { createApp } from './server/createApp'
import { createStubGoalAnalyzer, createStubTaskExecutor } from './server/stubs'
import { LlmGoalAnalyzer } from '@orchestrator/LlmGoalAnalyzer'
import { createAnthropicProvider } from '@orchestrator/AnthropicProvider'
import { WorkerTaskExecutor } from '@orchestrator/WorkerTaskExecutor'
import { BudgetGovernor } from '@governor/BudgetGovernor'
import { DeterministicEvaluator } from '@eval/DeterministicEvaluator'
import { LlmCriticEvaluator } from '@eval/LlmCriticEvaluator'
import { EscalationEvaluator } from '@eval/EscalationEvaluator'
import { EvalPipeline } from '@eval/EvalPipeline'
import { ResearchWorker } from './workers/ResearchWorker'
import { AgentRole } from '@shared/types'
import type { GoalAnalyzer, TaskExecutor } from '@orchestrator/IJarvis'
import type { IWorker } from './workers/IWorker'

const config = loadConfig()
const log = logger

// ---------------------------------------------------------------------------
// Wire real or stub implementations depending on available config
// ---------------------------------------------------------------------------

let goalAnalyzer: GoalAnalyzer
let taskExecutor: TaskExecutor

if (config.anthropicApiKey) {
  log.info('ANTHROPIC_API_KEY detected — using real LlmGoalAnalyzer + WorkerTaskExecutor')

  const llmProvider = createAnthropicProvider()
  goalAnalyzer = new LlmGoalAnalyzer(llmProvider)

  // Build eval pipeline (stubs for LLM critic/escalation until wired)
  const governor = new BudgetGovernor(config.budgetStateFile)
  const deterministic = new DeterministicEvaluator()
  const llmCritic = new LlmCriticEvaluator({
    async evaluate() { return { pass: true, confidence: 1.0, reasoning: 'stub — no LLM critic configured' } },
  })
  const escalation = new EscalationEvaluator({
    async evaluate() { return { pass: true, confidence: 1.0, reasoning: 'stub', recommendation: 'accept' as const } },
  })
  const evalPipeline = new EvalPipeline(deterministic, llmCritic, escalation)

  // Worker registry — add more workers here as they are built
  const workerRegistry = new Map<string, IWorker>([
    [AgentRole.Worker, new ResearchWorker(llmProvider)],
    [AgentRole.Researcher, new ResearchWorker(llmProvider)],
    [AgentRole.Implementer, new ResearchWorker(llmProvider)],
  ])

  taskExecutor = new WorkerTaskExecutor(governor, evalPipeline, workerRegistry)
  log.info({ workerCount: workerRegistry.size }, 'Real WorkerTaskExecutor constructed')
} else {
  log.warn('No ANTHROPIC_API_KEY — running in STUB mode (no real LLM calls)')
  goalAnalyzer = createStubGoalAnalyzer()
  taskExecutor = createStubTaskExecutor()
}

const container = createContainer(goalAnalyzer, taskExecutor)
const app = createApp(container)

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info({ port: info.port }, 'Agent Empire API server started')
})

function shutdown(signal: string) {
  log.info({ signal }, 'Shutting down...')
  server.close(() => {
    log.info('Server closed')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
