import { EventEmitter } from 'node:events'
import { nanoid } from 'nanoid'
import {
  AgentId,
  AgentIdentity,
  CounterpartyId,
  CounterpartyRecord,
  EventType,
  Mandate,
  MandateId,
  SystemEvent,
  TrustAuditEntry,
  createTrustAuditEntryId,
} from '@shared/types'
import { CounterpartyRegistry } from './CounterpartyRegistry'
import { IAgentIdentityService } from './IAgentIdentityService'
import { IMandateService } from './IMandateService'
import { TrustAuditLog } from './TrustAuditLog'

export type RevocationTargetType = 'agent' | 'mandate' | 'wallet' | 'counterparty'

export interface RevocationRuntimeOptions {
  now: () => Date
  createEventId: () => string
  defaultTenantId?: string
  actorId: string
}

export class FrozenWalletStore {
  private readonly frozenWalletsByTenant = new Map<string, Set<string>>()

  public isFrozen(tenantId: string, walletId: string): boolean {
    return this.getTenantWallets(tenantId).has(walletId)
  }

  public freeze(tenantId: string, walletId: string): boolean {
    const wallets = this.getTenantWallets(tenantId)
    if (wallets.has(walletId)) return false
    wallets.add(walletId)
    return true
  }

  private getTenantWallets(tenantId: string): Set<string> {
    const existing = this.frozenWalletsByTenant.get(tenantId)
    if (existing) return existing
    const created = new Set<string>()
    this.frozenWalletsByTenant.set(tenantId, created)
    return created
  }
}

export function createRuntimeOptions(
  options: Partial<RevocationRuntimeOptions>,
): RevocationRuntimeOptions {
  return {
    now: options.now ?? (() => new Date()),
    createEventId: options.createEventId ?? (() => `trust_revocation_${nanoid()}`),
    defaultTenantId: options.defaultTenantId,
    actorId: options.actorId ?? 'system',
  }
}

export function resolveTenantId(defaultTenantId: string | undefined, tenantId?: string): string {
  const resolvedTenantId = tenantId ?? defaultTenantId
  if (!resolvedTenantId) throw new Error('Tenant ID is required for revocation action')
  return resolvedTenantId
}

export async function appendRevocationAudit(
  trustAuditLog: TrustAuditLog,
  now: () => Date,
  actorId: string,
  tenantId: string,
  eventType: TrustAuditEntry['eventType'],
  subjectId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await trustAuditLog.append({
    entryId: createTrustAuditEntryId(`trust_audit_${nanoid()}`),
    tenantId,
    eventType,
    subjectId,
    actorId,
    details,
    timestamp: now().toISOString(),
  })
}

export function emitRevocationAlert(
  emitter: EventEmitter | undefined,
  now: () => Date,
  createEventId: () => string,
  tenantId: string,
  targetType: RevocationTargetType,
  targetId: string,
  severity: SystemEvent['severity'],
  details: Record<string, unknown>,
): void {
  if (!emitter) return
  const event: SystemEvent = {
    eventId: createEventId(),
    eventType: EventType.CircuitBreakerTripped,
    timestamp: now().toISOString(),
    payload: { tenantId, targetType, targetId, ...details },
    severity,
  }
  emitter.emit(EventType.CircuitBreakerTripped, event)
}

export async function blockCounterparty(
  counterpartyRegistry: CounterpartyRegistry,
  tenantId: string,
  counterpartyId: CounterpartyId,
): Promise<CounterpartyRecord> {
  const record = await counterpartyRegistry.get(tenantId, counterpartyId)
  if (!record) throw new Error(`Counterparty not found: ${counterpartyId}`)
  if (record.trustStatus === 'blocked') return record
  if (record.trustStatus === 'watch') {
    return counterpartyRegistry.updateTrustStatus(tenantId, counterpartyId, 'blocked')
  }
  await counterpartyRegistry.updateTrustStatus(tenantId, counterpartyId, 'watch')
  return counterpartyRegistry.updateTrustStatus(tenantId, counterpartyId, 'blocked')
}

export async function requireIdentity(
  identityService: IAgentIdentityService,
  agentId: AgentId,
): Promise<AgentIdentity> {
  const identity = await identityService.get(agentId)
  if (!identity) throw new Error(`Identity not found: ${agentId}`)
  return identity
}

export async function requireMandate(
  mandateService: IMandateService,
  mandateId: MandateId,
): Promise<Mandate> {
  const mandate = await mandateService.get(mandateId)
  if (!mandate) throw new Error(`Mandate not found: ${mandateId}`)
  return mandate
}

export async function revokeIdentityStatus(
  identityService: IAgentIdentityService,
  agentId: AgentId,
  verificationStatus: AgentIdentity['verificationStatus'],
  reason: string,
): Promise<boolean> {
  if (verificationStatus === 'revoked') return false
  await identityService.revoke(agentId, reason)
  return true
}

export async function revokeActiveMandates(
  mandateService: IMandateService,
  agentId: AgentId,
  revokeMandate: (mandateId: MandateId) => Promise<void>,
): Promise<number> {
  const mandates = await mandateService.listByAgent(agentId)
  let revokedCount = 0
  for (const mandate of mandates) {
    if (mandate.status === 'active') {
      await revokeMandate(mandate.mandateId)
      revokedCount += 1
    }
  }
  return revokedCount
}

export async function freezeWalletBindings(
  walletBindings: string[],
  freezeWallet: (walletId: string) => Promise<boolean>,
): Promise<number> {
  let frozenCount = 0
  for (const walletId of walletBindings) {
    if (await freezeWallet(walletId)) frozenCount += 1
  }
  return frozenCount
}
