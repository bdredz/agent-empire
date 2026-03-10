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
import { DispatcherMinion } from '@orchestrator/DispatcherMinion'
import { Librarian } from '@librarian/Librarian'
import { CapabilityManifestWriter } from '@librarian/CapabilityManifestWriter'
import { InternalRegistry } from '@librarian/InternalRegistry'
import type { ILibrarianStore } from '@librarian/Librarian'
import { SourcePolicyEngine } from '../evidence/SourcePolicyEngine.js'
import { EvidenceStore } from '../evidence/EvidenceStore.js'
import { ClaimExtractor } from '../evidence/ClaimExtractor.js'
import { FreshnessScorer } from '../evidence/FreshnessScorer.js'
import { CitationCompiler } from '../evidence/CitationCompiler.js'
import { ResearchReportBuilder } from '../evidence/ResearchReportBuilder.js'
import { ResearchBroker } from '../evidence/ResearchBroker.js'
import type { IResearchBroker } from '../evidence/IResearchBroker.js'
// Trust Plane
import { TrustAuditLog } from '../trust/TrustAuditLog.js'
import { AgentIdentityService } from '../trust/AgentIdentityService.js'
import { MandateService } from '../trust/MandateService.js'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry.js'
import { VerificationPolicyEngine } from '../trust/VerificationPolicyEngine.js'
import { AgentReputationService } from '../trust/AgentReputationService.js'
import { RevocationService } from '../trust/RevocationService.js'
// Commerce Plane
import { ReceiptService } from '../commerce/ReceiptService.js'
import { QuoteService } from '../commerce/QuoteService.js'
import { RefundPolicyEngine } from '../commerce/RefundPolicyEngine.js'
import { DisputeService } from '../commerce/DisputeService.js'
import { SettlementReconciler } from '../commerce/SettlementReconciler.js'
import { CommerceOrchestrator } from '../commerce/CommerceOrchestrator.js'
import { StripeCommerceAdapter } from '../commerce/adapters/StripeCommerceAdapter.js'
import { X402Adapter } from '../commerce/adapters/X402Adapter.js'
import { CoinbaseWalletAdapter } from '../commerce/adapters/CoinbaseWalletAdapter.js'
import { McpPayAdapter } from '../commerce/adapters/McpPayAdapter.js'
import type { ICommerceRailAdapter } from '../commerce/ICommerceRailAdapter.js'
import { WalletPolicyEngine } from '../commerce/wallets/WalletPolicyEngine.js'
import { WalletBindingService } from '../commerce/wallets/WalletBindingService.js'
import { TreasuryLedger } from '../commerce/treasury/TreasuryLedger.js'
import { TreasuryService } from '../commerce/treasury/TreasuryService.js'
// Discovery Plane
import { InternalServiceRegistry } from '../discovery/InternalServiceRegistry.js'
import { DiscoveryPolicyEngine } from '../discovery/DiscoveryPolicyEngine.js'
import { ExternalManifestPublisher } from '../discovery/ExternalManifestPublisher.js'
import { ProtocolInjectionSwarm } from '../discovery/ProtocolInjectionSwarm.js'
// Gateway
import { InboundTrustMiddleware } from '../gateway/InboundTrustMiddleware.js'
import { CounterpartyRateLimiter } from '../gateway/CounterpartyRateLimiter.js'
import { PaymentChallengeMiddleware } from '../gateway/PaymentChallengeMiddleware.js'
import { AgentGradeApiGateway } from '../gateway/AgentGradeApiGateway.js'
import { getConfig } from '@shared/config'
import { createChildLogger } from '@shared/logger'
import type { GoalAnalyzer, TaskExecutor } from '@orchestrator/IJarvis'
import type { KnowledgeEntry, ArtifactId, CommerceRail } from '@shared/types'
import type { QueryFilters } from '@librarian/ILibrarian'
import type { VectorMatch } from '@librarian/Librarian'

export interface Container {
  readonly factory: AgentFactory
  readonly governor: BudgetGovernor
  readonly mechanic: Mechanic
  readonly evalPipeline: EvalPipeline
  readonly jarvis: Jarvis
  readonly dispatcher: DispatcherMinion
  readonly librarian: Librarian
  readonly researchBroker: IResearchBroker
  // Trust Plane
  readonly trustAuditLog: TrustAuditLog
  readonly identityService: AgentIdentityService
  readonly mandateService: MandateService
  readonly counterpartyRegistry: CounterpartyRegistry
  readonly verificationPolicyEngine: VerificationPolicyEngine
  readonly reputationService: AgentReputationService
  readonly revocationService: RevocationService
  // Commerce Plane
  readonly commerceOrchestrator: CommerceOrchestrator
  readonly receiptService: ReceiptService
  readonly walletBindingService: WalletBindingService
  readonly treasuryService: TreasuryService
  // Discovery Plane
  readonly discoveryRegistry: InternalServiceRegistry
  readonly manifestPublisher: ExternalManifestPublisher
  // Gateway
  readonly gateway: AgentGradeApiGateway
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

  const librarian = new Librarian(stubLibrarianStore)
  const capabilityRegistry = new InternalRegistry()
  const manifestWriter = new CapabilityManifestWriter(librarian)

  const docker = new DockerProvisioner()
  const database = new DatabaseProvisioner(stubDatabaseExecutor)
  const repo = new RepoProvisioner(config.githubOrg)
  const mechanic = new Mechanic(
    docker,
    database,
    repo,
    config.mechanicStateFile,
    undefined,
    undefined,
    undefined,
    manifestWriter,
    capabilityRegistry,
  )

  const deterministic = new DeterministicEvaluator()
  const llmCritic = new LlmCriticEvaluator(stubLlmCriticProvider)
  const escalation = new EscalationEvaluator(stubEscalationProvider)
  const evalPipeline = new EvalPipeline(deterministic, llmCritic, escalation)

  const dispatcher = new DispatcherMinion(taskExecutor, governor, evalPipeline)
  const jarvis = new Jarvis(goalAnalyzer, taskExecutor, {}, dispatcher)

  // Evidence Plane
  const sourcePolicyEngine = new SourcePolicyEngine({
    deniedDomains: ['spam.com', 'malware.net'],
    highRiskDomains: ['unverified.io'],
  })
  const evidenceStore = new EvidenceStore()
  const claimExtractor = new ClaimExtractor()
  const freshnessScorer = new FreshnessScorer()
  const citationCompiler = new CitationCompiler()
  const reportBuilder = new ResearchReportBuilder()
  const researchBroker: IResearchBroker = new ResearchBroker(
    sourcePolicyEngine,
    evidenceStore,
    claimExtractor,
    freshnessScorer,
    citationCompiler,
    reportBuilder,
    (proposal) => {
      librarian.submitProposal(proposal).catch((err: unknown) => {
        log.error({ err }, 'Failed to submit research proposal to librarian')
      })
    }
  )

  // Trust Plane
  const trustAuditLog = new TrustAuditLog()
  const identityService = new AgentIdentityService(trustAuditLog)
  const mandateService = new MandateService(trustAuditLog)
  const counterpartyRegistry = new CounterpartyRegistry()
  const verificationPolicyEngine = new VerificationPolicyEngine(identityService, mandateService)
  const reputationService = new AgentReputationService(identityService)
  const revocationService = new RevocationService(
    identityService,
    mandateService,
    counterpartyRegistry,
    trustAuditLog,
  )

  // Commerce Plane
  const receiptService = new ReceiptService()
  const quoteService = new QuoteService(counterpartyRegistry)
  const refundPolicyEngine = new RefundPolicyEngine()
  const disputeService = new DisputeService(receiptService)
  const railAdapters = new Map<CommerceRail, ICommerceRailAdapter>([
    ['stripe', new StripeCommerceAdapter()],
    ['x402', new X402Adapter()],
    ['coinbase_wallet', new CoinbaseWalletAdapter()],
    ['mcp_pay', new McpPayAdapter()],
  ])
  const settlementReconciler = new SettlementReconciler(receiptService, railAdapters)
  const commerceOrchestrator = new CommerceOrchestrator(
    quoteService,
    receiptService,
    refundPolicyEngine,
    settlementReconciler,
    mandateService,
    verificationPolicyEngine,
    trustAuditLog,
    railAdapters,
  )
  const walletPolicyEngine = new WalletPolicyEngine()
  const walletBindingService = new WalletBindingService(identityService, trustAuditLog)
  const treasuryLedger = new TreasuryLedger()
  const treasuryService = new TreasuryService(walletPolicyEngine, treasuryLedger)

  // Discovery Plane
  const discoveryRegistry = new InternalServiceRegistry()
  const discoveryPolicyEngine = new DiscoveryPolicyEngine({ minReliabilityScore: 0.7 })
  const manifestPublisher = new ExternalManifestPublisher(discoveryRegistry, discoveryPolicyEngine)
  const _protocolInjectionSwarm = new ProtocolInjectionSwarm([])

  // Gateway
  const inboundTrustMiddleware = new InboundTrustMiddleware(counterpartyRegistry, trustAuditLog)
  const counterpartyRateLimiter = new CounterpartyRateLimiter()
  const paymentChallengeMiddleware = new PaymentChallengeMiddleware(receiptService)
  const gateway = new AgentGradeApiGateway({
    trustMiddleware: inboundTrustMiddleware.createMiddleware(),
    rateLimitMiddleware: counterpartyRateLimiter.createMiddleware(),
    paymentChallengeMiddleware: paymentChallengeMiddleware.createMiddleware(),
  })

  // Suppress unused variable warning — swarm is constructed for side-effect registration
  void _protocolInjectionSwarm
  // Suppress unused variable warning — disputeService is constructed for side-effect wiring
  void disputeService

  log.info('All components initialized')

  return {
    factory,
    governor,
    mechanic,
    evalPipeline,
    jarvis,
    dispatcher,
    librarian,
    researchBroker,
    // Trust Plane
    trustAuditLog,
    identityService,
    mandateService,
    counterpartyRegistry,
    verificationPolicyEngine,
    reputationService,
    revocationService,
    // Commerce Plane
    commerceOrchestrator,
    receiptService,
    walletBindingService,
    treasuryService,
    // Discovery Plane
    discoveryRegistry,
    manifestPublisher,
    // Gateway
    gateway,
  }
}
