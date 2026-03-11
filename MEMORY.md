# Agent Empire: Project Memory

> For Phase 1–3 build history, see [`MEMORY-HISTORY.md`](./MEMORY-HISTORY.md).

## Current State

| Field | Value |
|-------|-------|
| **Branch** | `main` |
| **Tests** | 731/731 passing, 90 files |
| **Typecheck** | PASS (0 errors) |
| **Phase** | Phase 3 COMPLETE — Phase 4 next |
| **Date** | 2026-03-11 |

## Phase 3 Summary

- **59/59 tasks PASS** across 3 agents (CODEX 30, GEMINI 17, OPUS 12)
- **All 9 waves PASS** (Contract Freeze → Trust → Evidence → Commerce → Adapters → Wallet/Treasury → Discovery → Hive Mind V2 + Dashboard → Gateway → Integration & Chaos)
- 5 integration test suites: trustPlane (7), evidencePlane (6), commercePlane (12), crossPlane (6), chaosProtocol (9)

## Constructor Gotchas (Active)

These prevent wasted subagent cycles — include in every subagent prompt that touches these services:

- `Jarvis(goalAnalyzer, taskExecutor, config?, dispatcher?)` — dispatcher is optional 4th param
- `RevocationService(identityService, mandateService, counterpartyRegistry, auditLog, undefined, { defaultTenantId })`
- `CommerceOrchestrator(quoteService, receiptService, refundPolicyEngine, settlementReconciler, mandateService, policyEngine, trustAuditLog, railAdapters, { now })`
- `WalletPolicyEngine({ now?: () => Date })` — NOT `{ defaultTenantId }`
- `WalletPolicyEngine` methods: `.upsertPolicy(WalletPolicy)` and `.evaluate(walletId, transaction)` — NOT `.registerPolicy()` / `.evaluateTransaction()`
- `AgentHandle` has many required fields — use `as unknown as AgentHandle` for test fixtures
- `MemoryKind` is a type union NOT a const object — use `'observation' as MemoryKind`
- `RetrievalPolicyEnforcer.enforce()` requires full `RetrievalPolicy` object, NOT just `{ tenantId }`
- `QuoteService` gates on blocked counterparty (throws 'Counterparty is blocked')
- Expired/consumed mandates → 'Payment action denied: active_mandate_required' (VerificationPolicyEngine checks first)

## Architecture Quick Reference

### Planes (Phase 3)
- **Trust** (`src/trust/`): Identity, Mandate, Counterparty, Verification, Reputation, Revocation, AuditLog
- **Evidence** (`src/evidence/`): ResearchBroker, SourcePolicy, EvidenceStore, ClaimExtractor, Freshness, Citation, ReportBuilder
- **Commerce** (`src/commerce/`): Orchestrator, Quote, Receipt, Refund, Settlement, Dispute + 4 rail adapters + Wallet/Treasury
- **Discovery** (`src/discovery/`): InternalServiceRegistry, DiscoveryPolicy, ManifestPublisher, ProtocolInjection
- **Gateway** (`src/gateway/`): ApiGateway, InboundTrust, CounterpartyRateLimiter, PaymentChallenge

### Key Patterns
- All shared types in `src/shared/types.ts` — never define inline
- Branded types: `AgentId`, `TaskId`, `RunId`, `MandateId`, `QuoteId`, `ReceiptId`, `EvidenceId`, etc.
- Path aliases: `@shared/*`, `@factory/*`, `@eval/*`, `@orchestrator/*`, `@governor/*`, `@mechanic/*`, `@workers/*`, `@primitives/*`, `@librarian/*`
- No `@evidence/*` alias yet — evidence uses relative imports
- No `@runtime/*` alias yet — runtime uses relative imports
- Evidence services use relative imports (`../evidence/...`)

## Operational Notes

- Worktree isolation: deliverables for other agents MUST be on `main`, not a worktree branch
- Merge conflicts: coordinate with user before resolving shared files (e.g. `types.ts`) if other agents are active
- Subagent worktree drift: verify file locations after subagent completion before committing
- `AnthropicProvider` uses raw `fetch` (no SDK dep) — test with `.env` containing `ANTHROPIC_API_KEY`
- `setInterval` in middleware requires `.unref?.()` to prevent blocking process exit
