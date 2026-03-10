# PHASE 3 MASTER BLUEPRINT — TRUST, EVIDENCE, COMMERCE

---

## 0. PURPOSE

This document defines the next implementation phase for Agent Empire after the Phase 2 control-plane and memory-spine work.

Phase 3 is the bridge from:
- internal operating system
- controlled multi-agent runtime
- durable memory discipline

to:
- trusted external action
- live research on the public internet
- verifiable identity and authority
- agentic commerce
- monetizable, discoverable, external-facing agent businesses

This phase is not about adding more agents for the sake of it.

It is about making the empire safe and durable enough to:
- browse
- verify
- authorize
- pay
- get paid
- settle
- dispute
- and explain why an agent was allowed to act

---

## 1. EXECUTIVE VERDICT

### The core call
Do not re-platform the empire around a framework.

Keep the center of gravity in your own system:
- typed contracts
- control plane
- trust plane
- evidence plane
- commerce plane
- discovery plane
- append-only ledgers

Use external frameworks and protocols as adapters and pattern libraries, not as the constitution of the empire.

### The architectural principle
**Internal core = custom, contract-first, durable, typed.**  
**External edge = protocol adapters, vendor integrations, registries, wallets, payments.**

That is how the system stays relevant and evolvable over a 5–10 year horizon.

---

## 2. WHAT ALREADY EXISTS

The earlier build established the internal shell:
- shared system contracts and typed core
- Jarvis orchestrator
- Factory
- Budget Governor
- Eval Pipeline
- Mechanic
- Librarian
- worker catalog
- tool primitives
- dashboard
- integration and server wiring

The inventory also showed the original architecture problem clearly:
- Jarvis still handled goal analysis, DAG decomposition, execution oversight, and escalation
- ResearchWorker existed, but as an LLM-backed research task worker, not a production-grade research system
- Librarian was pgvector-oriented and already responsible for dedup, TTL, and conflict resolution
- dev/test stub boot paths still existed in the server and entrypoint shell

Phase 2 corrected the operating-system layer:
- dispatcher/minion logic
- durability/checkpointing
- deterministic telemetry and audits
- Mechanic safety hardening
- dynamic tool loading
- capability manifests
- stronger memory discipline

That means the next bottleneck is no longer control-plane shape.

The next bottleneck is **external trust**.

---

## 3. PHASE 3 NAME

# Phase 3 — Trusted External Operations
### Subtitle: Trust, Evidence, and Commerce

This phase makes Agent Empire safe to:
- interact with external systems
- research the public internet
- verify internal and external agents
- authorize delegated actions
- make and receive payments
- publish and monetize agent-first services
- and preserve trust and auditability while doing it

---

## 4. THE SPIRIT OF THE THING

### 4.1 What this phase is really doing
Phase 2 made the empire internally disciplined.

Phase 3 makes it externally credible.

This phase is about ensuring:
- no agent acts without identity
- no payment happens without authorization
- no research result becomes memory without evidence
- no external service gets exposed without trust signals
- and no money-moving or high-risk action becomes detached from audit trails

### 4.2 The philosophical rule
**Trust before autonomy.  
Evidence before memory.  
Ledger before money.  
Adapters before lock-in.**

### 4.3 The failure mode to avoid
Do not let “agentic commerce” become “agents can spend money now.”

That is not progress. That is just accelerating blast radius.

---

## 5. PHASE 3 OBJECTIVES

1. Build a first-class **Trust Plane**
2. Build a first-class **Evidence Plane**
3. Build a rail-agnostic **Commerce Plane**
4. Upgrade the Hive Mind into a **trust-aware memory system**
5. Add **Discovery & Distribution** infrastructure for agent-first businesses
6. Add the right **ledgers, audits, and receipts** so the empire can explain itself

---

## 6. WHAT IS NEEDED VS WHAT IS NOT

## 6.1 Needed now
- Agent identity and verification
- Delegated authority / mandates
- Counterparty trust scoring
- Research with evidence and freshness
- Canonical internal transaction/action ledger
- Wallet policy engine
- Treasury service
- Refund / credit policy
- Rail adapters for fiat and crypto
- External service manifests and trust signals
- Structured receipts and dispute handling
- Research evidence store
- Policy-bound browsing and source controls

## 6.2 Not needed now
- rewriting the empire around CrewAI / AutoGen / Semantic Kernel / LlamaIndex workflows
- a graph database as the first step
- full onchain settlement for every micro-action
- broad autonomous money movement without mandates
- free-form wallet access from workers
- external research writing directly into durable memory
- framework-owned memory as your canonical memory layer
- more worker categories before trust/evidence/commerce are in place

---

## 7. TARGET ARCHITECTURE

The empire should now have six planes:

### 7.1 Control Plane
Already established.
Owns:
- planning
- task routing
- retries
- wait states
- escalation
- checkpointing

### 7.2 Memory Plane
Already hardened in Phase 2.
Owns:
- memory proposals
- knowledge curation
- retrieval policy
- tenant isolation
- manifests and durable facts

### 7.3 Evidence Plane
New.
Owns:
- raw research fetches
- citations
- claim extraction
- freshness scoring
- provenance
- evidence bundles

### 7.4 Trust Plane
New.
Owns:
- agent identity
- verification status
- delegated authority
- counterparty trust
- revocation
- action policy
- audit trails

### 7.5 Commerce Plane
New.
Owns:
- quoting
- authorization
- challenge/response payment flows
- capture
- settlement
- refunds
- credits
- reconciliation
- disputes

### 7.6 Discovery Plane
New.
Owns:
- capability manifests
- external service descriptors
- registry publishing
- internal and external service discovery

---

## 8. EXACT MODULE PLAN

## 8.1 Trust Plane

### Add
- `src/trust/AgentIdentityService.ts`
- `src/trust/IAgentIdentityService.ts`
- `src/trust/MandateService.ts`
- `src/trust/IMandateService.ts`
- `src/trust/VerificationPolicyEngine.ts`
- `src/trust/CounterpartyRegistry.ts`
- `src/trust/AgentReputationService.ts`
- `src/trust/TrustAuditLog.ts`
- `src/trust/RevocationService.ts`

### Responsibilities
#### AgentIdentityService
- issue internal agent identities
- bind agent to business unit, owner/org, and role
- store verification state
- store key bindings / wallet bindings
- support suspension and revocation

#### MandateService
- create task-scoped mandates
- validate delegated authority
- define scope, time, amount, merchant, and category limits
- attach mandate IDs to transactions and external actions

#### VerificationPolicyEngine
- enforce Know Your Agent style rules
- require stronger verification for higher-risk actions
- map policy by action type, spend level, counterparty, and data sensitivity

#### CounterpartyRegistry
- maintain known merchants, MCP providers, agent platforms, and API sellers
- track trust score and risk flags
- store allowed / blocked / unknown status

#### AgentReputationService
- compute reliability and trust indicators
- track delivery success, refund rate, dispute rate, policy violations, uptime, and schema reliability

#### TrustAuditLog
- immutable append-only records of identity issuance, verification changes, mandate creation, revocation, and overrides

---

## 8.2 Evidence Plane

### Add
- `src/evidence/ResearchBroker.ts`
- `src/evidence/IResearchBroker.ts`
- `src/evidence/SourcePolicyEngine.ts`
- `src/evidence/EvidenceStore.ts`
- `src/evidence/ClaimExtractor.ts`
- `src/evidence/CitationCompiler.ts`
- `src/evidence/FreshnessScorer.ts`
- `src/evidence/ResearchReportBuilder.ts`

### Responsibilities
#### ResearchBroker
Deterministic coordinator that:
- receives a research objective
- applies source policy
- defines freshness requirements
- enforces retrieval budget
- coordinates fetch → extract → compare → summarize
- emits only evidence-backed outputs

#### SourcePolicyEngine
- allow / deny lists by domain and category
- recency requirements
- source trust tiers
- escalation for high-risk domains

#### EvidenceStore
- raw fetch snapshots or hashes
- extracted facts
- source timestamps
- claim-to-source mappings
- provenance metadata

#### ClaimExtractor
- turn fetched evidence into atomic claims

#### CitationCompiler
- create human- and machine-readable citation bundles

#### FreshnessScorer
- tag evidence and claims with recency/freshness confidence

#### ResearchReportBuilder
- structured report generation from claims and evidence

---

## 8.3 Commerce Plane

### Add
- `src/commerce/CommerceOrchestrator.ts`
- `src/commerce/ICommerceOrchestrator.ts`
- `src/commerce/QuoteService.ts`
- `src/commerce/ReceiptService.ts`
- `src/commerce/DisputeService.ts`
- `src/commerce/SettlementReconciler.ts`
- `src/commerce/RefundPolicyEngine.ts`
- `src/commerce/wallets/WalletPolicyEngine.ts`
- `src/commerce/wallets/WalletBindingService.ts`
- `src/commerce/treasury/TreasuryService.ts`
- `src/commerce/treasury/TreasuryLedger.ts`

### Rail adapters
- `src/commerce/adapters/StripeCommerceAdapter.ts`
- `src/commerce/adapters/CoinbaseWalletAdapter.ts`
- `src/commerce/adapters/X402Adapter.ts`
- `src/commerce/adapters/McpPayAdapter.ts`
- `src/commerce/adapters/AP2MandateAdapter.ts`

### Responsibilities
#### CommerceOrchestrator
Canonical internal payment API.
Must normalize:
- quote
- authorize
- challenge
- pay
- capture
- settle
- refund
- issue credit
- verify receipt
- reconcile

#### WalletPolicyEngine
- max per transaction
- max per session
- max daily outflow
- asset allowlists
- merchant/category allowlists
- wallet-to-agent binding
- emergency freeze

#### TreasuryService
- wallet funding
- sweep rules
- treasury balances
- settlement workflows
- refunds and credits

#### RefundPolicyEngine
- low-risk auto-refund
- auto-credit rules
- deterministic replay checks
- manual review threshold

#### SettlementReconciler
- compare internal ledger vs provider settlements
- detect duplicates, missing captures, stale pending settlements

---

## 8.4 Discovery Plane

### Add
- `src/discovery/InternalServiceRegistry.ts`
- `src/discovery/ExternalManifestPublisher.ts`
- `src/discovery/ProtocolInjectionSwarm.ts`
- `src/discovery/DiscoveryPolicyEngine.ts`

### Responsibilities
#### InternalServiceRegistry
- index internal service manifests
- support agent capability lookups
- map service → owner → auth scheme → version → reliability score

#### ExternalManifestPublisher
- publish `.well-known` assets
- publish machine-readable service metadata
- publish merchant/service trust metadata

#### ProtocolInjectionSwarm
- distribute your agent-first services into agent registries and default examples
- submit controlled PRs / registrations into external discovery surfaces
- monitor listings and drift

#### DiscoveryPolicyEngine
- decide what gets published
- ensure private/internal services never leak

---

## 8.5 Gateway and Edge Hardening

### Add
- `src/gateway/AgentGradeApiGateway.ts`
- `src/gateway/PaymentChallengeMiddleware.ts`
- `src/gateway/CounterpartyRateLimiter.ts`
- `src/gateway/InboundTrustMiddleware.ts`

### Responsibilities
- edge JSON schema validation
- token-aware / agent-aware rate limiting
- 402-style payment challenge support
- inbound agent verification checks
- recursive traffic suppression
- counterparty policy enforcement before requests touch core systems

---

## 9. PROPOSED SHARED TYPES

All shared contracts belong in `src/shared/types.ts`.

## 9.1 Trust types
```ts
export interface AgentIdentity {
  agentId: string;
  tenantId: string;
  businessUnitId?: string;
  ownerType: "user" | "organization" | "system";
  ownerId: string;
  role: AgentRole;
  verificationStatus: "unverified" | "verified" | "restricted" | "revoked";
  walletBindings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Mandate {
  mandateId: string;
  tenantId: string;
  businessUnitId?: string;
  principalId: string;
  delegatedAgentId: string;
  purpose: string;
  scope: string[];
  maxAmount?: number;
  currency?: string;
  allowedMerchants?: string[];
  allowedCategories?: string[];
  expiresAt: string;
  status: "active" | "expired" | "revoked" | "consumed";
  createdAt: string;
}

export interface CounterpartyRecord {
  counterpartyId: string;
  displayName: string;
  counterpartyType: "merchant" | "mcp_server" | "api_provider" | "agent_platform";
  trustStatus: "trusted" | "watch" | "blocked" | "unknown";
  riskScore: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

## 9.2 Evidence types
```ts
export interface EvidenceRecord {
  evidenceId: string;
  tenantId: string;
  questionId: string;
  sourceUrl: string;
  sourceType: "webpage" | "api" | "document" | "registry";
  fetchedAt: string;
  publishedAt?: string;
  contentHash: string;
  trustScore: number;
  freshnessScore: number;
}

export interface AtomicClaim {
  claimId: string;
  evidenceId: string;
  statement: string;
  confidence: number;
  extractedAt: string;
}

export interface ResearchReport {
  reportId: string;
  tenantId: string;
  question: string;
  answer: string;
  claims: AtomicClaim[];
  evidenceIds: string[];
  freshnessDate: string;
  confidence: number;
  gaps: string[];
  recommendedNextAction?: string;
}
```

## 9.3 Commerce types
```ts
export interface CommerceQuote {
  quoteId: string;
  tenantId: string;
  businessUnitId?: string;
  counterpartyId: string;
  lineItems: Array<{
    description: string;
    amount: number;
    currency: string;
    quantity: number;
  }>;
  totalAmount: number;
  currency: string;
  expiresAt: string;
  createdAt: string;
}

export interface PaymentAuthorization {
  authorizationId: string;
  tenantId: string;
  businessUnitId?: string;
  agentId: string;
  mandateId?: string;
  quoteId?: string;
  rail: "stripe" | "x402" | "mcp_pay" | "coinbase_wallet";
  status: "authorized" | "challenged" | "denied" | "expired";
  amount: number;
  currency: string;
  createdAt: string;
}

export interface CommerceReceipt {
  receiptId: string;
  tenantId: string;
  businessUnitId?: string;
  agentId: string;
  counterpartyId: string;
  rail: "stripe" | "x402" | "mcp_pay" | "coinbase_wallet";
  externalTransactionId?: string;
  mandateId?: string;
  quoteId?: string;
  amount: number;
  currency: string;
  status: "pending" | "settled" | "failed" | "refunded" | "credited";
  createdAt: string;
}

export interface WalletPolicy {
  walletPolicyId: string;
  tenantId: string;
  walletId: string;
  maxPerTransaction?: number;
  maxPerSession?: number;
  maxDailyOutflow?: number;
  allowedAssets: string[];
  allowedMerchants?: string[];
  allowedCategories?: string[];
  requiresManualApprovalAbove?: number;
}
```

## 9.4 Discovery types
```ts
export interface ExternalCapabilityManifest {
  manifestId: string;
  tenantId: string;
  businessUnitId: string;
  serviceName: string;
  version: string;
  baseUrl: string;
  authScheme: "api_key" | "oauth" | "a402" | "internal_only";
  paymentRail?: "stripe" | "x402" | "mcp_pay";
  supportedOperations: string[];
  reliabilityScore?: number;
  trustBadge?: string;
  createdAt: string;
}
```

---

## 10. STORAGE MODEL

## 10.1 Canonical storage choices
### PostgreSQL = canonical system of record
Use Postgres for:
- agent identities
- mandates
- counterparty registry
- wallet bindings
- payment authorizations
- receipts
- settlement records
- refund / credit records
- action ledgers
- knowledge metadata
- capability manifests
- trust and audit records

### pgvector = semantic recall only
Use pgvector for:
- research claim retrieval
- architectural memory recall
- tenant-scoped semantic search
- capability discovery augmentation

pgvector is not the system of record. It is a recall accelerator.

### Redis = ephemeral and runtime support
Use Redis for:
- cache
- rate limiting
- distributed locks
- queue state
- short-lived payment challenge sessions
- semantic cache if retained

### Object storage = raw artifacts and evidence blobs
Use object storage for:
- fetched webpages
- PDF snapshots
- large logs
- receipts with full raw provider payloads
- generated manifest artifacts
- dispute packets

### Append-only ledgers
Use append-only relational tables for:
- mandate events
- commerce events
- treasury events
- action authorization events
- identity status changes
- memory promotion decisions

## 10.2 What not to do
- Do not make vector memory the primary ledger
- Do not store raw payment provider blobs only in Redis
- Do not put the canonical internal ledger onchain
- Do not use blockchain as your core system of record

---

## 11. PROTOCOL ADAPTER STRATEGY

## 11.1 AP2-style authorization layer
Use AP2 concepts as the **authorization language**, not the payment processor.

Internal use:
- mandate creation
- chain of authorization
- proof of delegated authority
- auditability of intent → cart → payment

## 11.2 Stripe adapter
Use for:
- fiat and conventional merchant commerce
- product catalogs
- in-context agent checkout
- business-facing merchant flows

## 11.3 x402 adapter
Use for:
- machine-to-machine API payments
- pay-per-call services
- autonomous API monetization
- external agent access to paid tools

## 11.4 Coinbase wallet adapter
Use for:
- wallet-native autonomous spend
- crypto-native treasury actions
- onchain settlement where appropriate

## 11.5 MCP-PAY adapter
Use for:
- MCP tool monetization
- experimental paid tool access
- per-call or per-session MCP payment flows

## 11.6 Internal rule
Protocols and providers must be replaceable.

Never let:
- Stripe payloads
- x402 headers
- wallet provider objects
- or MCP-specific payment messages

become your core business model.

---

## 12. RESEARCH SYSTEM DESIGN

## 12.1 The correct split
Do not build a “research LLM with internet access.”

Build:
- deterministic broker
- evidence collection
- claim extraction
- citation compilation
- bounded synthesis

## 12.2 Research run lifecycle
1. Jarvis/Dispatcher requests research
2. ResearchBroker creates a research plan
3. SourcePolicyEngine approves domains and freshness targets
4. fetchers retrieve evidence
5. EvidenceStore saves raw evidence and hashes
6. ClaimExtractor emits atomic claims
7. ResearchReportBuilder composes a structured answer
8. MemoryProposalEmitter submits candidate durable learnings to Librarian
9. Librarian accepts/rejects/promotes

## 12.3 Required output
Every research run must emit:
- question
- answer
- claims
- sources
- freshness date
- confidence
- unresolved gaps
- recommended next action
- memory proposals

## 12.4 Hard guardrail
Research never writes directly into durable memory.

---

## 13. TRUST MODEL

## 13.1 Core rule
No high-risk action without:
- verified identity
- mandate or explicit policy exemption
- policy check
- append-only audit event

## 13.2 Trust decision levels
### Level 0
read-only browsing, low-risk research

### Level 1
external API calls, low-risk service consumption

### Level 2
payment-capable actions, service purchases, wallet reads

### Level 3
wallet spend, settlement, refunds, merchant commitments

### Level 4
sensitive enterprise actions, regulated data access, financial moves above threshold

Each level must require increasing strength of:
- verification
- mandate precision
- logging
- approval

## 13.3 Revocation
Revocation must be fast and global.
If an agent identity, wallet binding, or counterparty becomes suspect:
- freeze permissions
- revoke outstanding mandates where possible
- mark trust status as restricted or revoked
- alert the dashboard and audit logs

---

## 14. COMMERCE MODEL

## 14.1 Canonical flow
1. quote
2. mandate check
3. policy check
4. provider-specific authorization or challenge
5. capture or settle
6. receipt issuance
7. ledger write
8. reconciliation
9. refund / credit if failure path triggers

## 14.2 Refund policy
### Low risk, low amount
auto-refund or auto-credit

### Medium risk
deterministic replay or credit first

### High risk
manual review

## 14.3 Revenue model support
This architecture supports:
- fiat checkout
- agentic product catalogs
- pay-per-use API services
- paid MCP tools
- subscription or pooled credit models
- hybrid human + agent checkout
- crypto-native microservices

---

## 15. HIVE MIND V2

The Hive Mind must now store more than semantic notes.

## 15.1 New namespaces
- `global_architecture`
- `tenant_operations`
- `research_facts`
- `identity_records`
- `commerce_records`
- `counterparty_records`
- `capability_manifests`
- `incident_records`

## 15.2 Required rules
- every durable entry must be typed
- every entry must have tenant scope
- research facts must have freshness and provenance
- trust records must be structurally queryable
- commerce records must be relational first, semantic second

## 15.3 Query rule
Agents query the Hive Mind. They do not “live inside” it.

---

## 16. NEXT PHASE SEQUENCING

Implement in this order:

### Sequence 1 — Freeze contracts
Add all new shared types first.

### Sequence 2 — Trust plane skeleton
Identity, mandates, policy engine, trust audit log.

### Sequence 3 — Evidence plane
ResearchBroker, SourcePolicyEngine, EvidenceStore, ClaimExtractor, report contract.

### Sequence 4 — Commerce core
CommerceOrchestrator, QuoteService, ReceiptService, ledgers, refund logic.

### Sequence 5 — Provider adapters
Stripe, x402, Coinbase wallet, MCP-PAY, AP2 mandate adapter.

### Sequence 6 — Wallet and treasury controls
WalletPolicyEngine, TreasuryService, SettlementReconciler.

### Sequence 7 — Discovery plane
Internal registry, manifest publisher, discovery policy, protocol injection swarm.

### Sequence 8 — Edge hardening
Agent-grade gateway, payment middleware, inbound trust checks, counterparty rate limiting.

### Sequence 9 — Controlled chaos protocol
Break trust, research, and payment paths intentionally and confirm clean self-arrest behavior.

---

## 17. ACCEPTANCE CRITERIA

## 17.1 Trust Plane
- no payment-capable action executes without identity + policy + audit
- mandate chain exists for delegated spend
- inbound external agents can be classified trusted / watch / blocked

## 17.2 Evidence Plane
- research outputs always cite evidence
- freshness is recorded
- evidence is stored
- memory writes are proposal-only
- browsing budget is enforced

## 17.3 Commerce Plane
- internal commerce API works across at least two rails
- receipts, disputes, refunds, and credits are normalized
- provider-specific payloads do not leak into Jarvis or worker logic

## 17.4 Wallet & Treasury
- spend caps work
- wallet freezes work
- auto-refund / credit rules work
- reconciliation detects drift

## 17.5 Discovery
- manifests are generated and indexed
- service trust metadata is publishable
- internal agents can discover internal services
- external publication can be selectively enabled

## 17.6 Hive Mind v2
- trust, commerce, and research records are not dumped into one semantic soup
- all memory remains policy-bound and tenant-aware
- Librarian can answer: “why was this agent allowed to do this?”

---

## 18. RUTHLESS GUARDRAILS

1. Do not give workers wallet authority.
2. Do not let research write durable memory directly.
3. Do not let a payment rail define your internal model.
4. Do not put the canonical ledger onchain.
5. Do not let identity be “wallet connected = trusted.”
6. Do not expose paid services without trust signals and receipts.
7. Do not let one provider own your protocol surface.
8. Do not add more agent categories before trust/evidence/commerce foundations are in place.
9. Do not settle every micro-action onchain.
10. Do not confuse discovery with publishing everything.

---

## 19. RISKS AND SOLUTIONS

## Risk 1 — Agents can spend before they are authorized
### Fix
MandateService + VerificationPolicyEngine + WalletPolicyEngine

## Risk 2 — Research pollutes the hive mind
### Fix
EvidenceStore + ClaimExtractor + MemoryProposal-only writes

## Risk 3 — Provider lock-in
### Fix
CommerceOrchestrator + provider adapters + canonical internal contracts

## Risk 4 — Too much onchain complexity too early
### Fix
Keep canonical ledger off-chain, use blockchain only for settlement/receipts where valuable

## Risk 5 — Rogue external agents hammer public endpoints
### Fix
AgentGradeApiGateway + inbound trust middleware + recursive traffic suppression + agent-aware rate limiting

## Risk 6 — Refunds and disputes become chaos
### Fix
RefundPolicyEngine + SettlementReconciler + append-only transaction ledger

## Risk 7 — “Trust” becomes hand-wavey marketing
### Fix
Identity records, mandates, receipts, reputations, proofs, explicit revocation, explicit ledger lineage

---

## 20. WHAT THE CODING AGENT SHOULD DO FIRST

Start with:
1. shared contracts
2. trust plane skeleton
3. evidence plane skeleton
4. canonical action and transaction ledgers

Do not start with:
- payment UI
- external registry publishing
- onchain smart contract cleverness
- broad wallet automation
- research summarization polish

The empire needs steel beams before decorative glass.

---

## 21. DIRECT EXECUTION BRIEF

> Build Phase 3 of Agent Empire as the Trusted External Operations phase.
> Preserve the existing control plane and memory spine.
> Start by freezing shared contracts for trust, evidence, commerce, wallets, mandates, receipts, and discovery.
> Add a Trust Plane with agent identities, mandates, verification policy, counterparty registry, revocation, and append-only trust audit logs.
> Add an Evidence Plane with ResearchBroker, SourcePolicyEngine, EvidenceStore, claim extraction, freshness scoring, citations, and structured research reports.
> Add a Commerce Plane with a canonical CommerceOrchestrator and adapter-based support for Stripe, x402, Coinbase wallet flows, MCP-PAY, and AP2-style authorization.
> Add wallet and treasury controls before enabling any agent payment path.
> Upgrade the Hive Mind into a trust-aware memory system with research, commerce, identity, and counterparty namespaces.
> Add discovery infrastructure for internal service lookup and selective external publication.
> Add an agent-grade gateway for inbound trust, payment challenges, and machine-traffic protection.
> Prioritize trust, evidence, ledgers, and auditability over new features.

---

## 22. FINAL JUDGMENT

Phase 2 made Agent Empire internally disciplined.

Phase 3 must make it externally trustworthy.

This is the phase where the empire stops being “a powerful internal lab” and starts becoming “a live, monetizable, resilient operating system for agent-first businesses.”

The center of gravity is not more intelligence.

It is:
- trust
- evidence
- ledgers
- wallet policy
- provider abstraction
- and durable explanation of why an agent was allowed to act

That is how the foundation becomes steel.

---
