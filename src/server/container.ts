import { AgentFactory } from '@factory/AgentFactory'
import { BudgetGovernor } from '@governor/BudgetGovernor'
import { Mechanic } from '@mechanic/Mechanic'
import { DockerProvisioner } from '@mechanic/DockerProvisioner'
import { DatabaseProvisioner } from '@mechanic/DatabaseProvisioner'
import { RepoProvisioner } from '@mechanic/RepoProvisioner'
import { DeterministicEvaluator } from '@eval/DeterministicEvaluator'
import { LlmCriticEvaluator } from '@eval/LlmCriticEvaluator'
import type { LlmCriticProvider } from '@eval/LlmCriticEvaluator'
import { EscalationEvaluator } from '@eval/EscalationEvaluator'
import type { EscalationProvider, EscalationContext } from '@eval/EscalationEvaluator'
import { EvalPipeline } from '@eval/EvalPipeline'
import { Jarvis } from '@orchestrator/Jarvis'
import { Librarian } from '@librarian/Librarian'
import type { ILibrarianStore } from '@librarian/Librarian'
import { getConfig } from '@shared/config'
import { createChildLogger } from '@shared/logger'
import type { GoalAnalyzer, TaskExecutor } from '@orchestrator/IJarvis'
import type { KnowledgeEntry, ArtifactId } from '@shared/types'
import type { QueryFilters } from '@librarian/ILibrarian'
import type { VectorMatch } from '@librarian/Librarian'

export interface Container {
  readonly factory: AgentFactory
  readonly governor: BudgetGovernor
  readonly mechanic: Mechanic
  readonly evalPipeline: EvalPipeline
  readonly jarvis: Jarvis
  readonly librarian: Librarian
}

// Stub providers — used at boot until real LLM/infra providers are wired
const stubLlmCriticProvider: LlmCriticProvider = {
  async evaluate(_prompt: string) {
    return { pass: true, confidence: 1.0, reasoning: 'stub — no LLM configured' }
  },
}

const stubEscalationProvider: EscalationProvider = {
  async evaluate(_prompt: string, _context: EscalationContext) {
    return { pass: true, confidence: 1.0, reasoning: 'stub — no LLM configured', recommendation: 'accept' as const }
  },
}

const stubDatabaseExecutor = {
  async execute(_statement: string): Promise<void> {
    createChildLogger('db-stub').info('Stub DB executor — no-op')
  },
}

const stubLibrarianStore: ILibrarianStore = {
  async save(_entry: KnowledgeEntry) {},
  async getById(_id: ArtifactId) { return null },
  async searchByText(_query: string, _filters?: QueryFilters) { return [] as KnowledgeEntry[] },
  async searchByVector(_embedding: number[], _filters?: QueryFilters) { return [] as VectorMatch[] },
  async removeOlderThan(_olderThanIso: string) { return [] as ArtifactId[] },
}

export function createContainer(
  goalAnalyzer: GoalAnalyzer,
  taskExecutor: TaskExecutor
): Container {
  const config = getConfig()
  const log = createChildLogger('container')

  log.info('Initializing Agent Empire components...')

  const factory = new AgentFactory()
  const governor = new BudgetGovernor(config.budgetStateFile)

  const docker = new DockerProvisioner()
  const database = new DatabaseProvisioner(stubDatabaseExecutor)
  const repo = new RepoProvisioner(config.githubOrg)
  const mechanic = new Mechanic(docker, database, repo, config.mechanicStateFile)

  const deterministic = new DeterministicEvaluator()
  const llmCritic = new LlmCriticEvaluator(stubLlmCriticProvider)
  const escalation = new EscalationEvaluator(stubEscalationProvider)
  const evalPipeline = new EvalPipeline(deterministic, llmCritic, escalation)

  const librarian = new Librarian(stubLibrarianStore)
  const jarvis = new Jarvis(goalAnalyzer, taskExecutor)

  log.info('All components initialized')

  return { factory, governor, mechanic, evalPipeline, jarvis, librarian }
}
