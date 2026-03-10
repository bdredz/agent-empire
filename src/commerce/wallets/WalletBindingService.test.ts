import { describe, expect, it } from 'vitest'
import { AgentId, AgentRole } from '@shared/types'
import { AgentIdentityService } from '../../trust/AgentIdentityService'
import { TrustAuditLog } from '../../trust/TrustAuditLog'
import { WalletBindingService } from './WalletBindingService'

const FIXED_NOW = new Date('2026-03-10T12:00:00.000Z')

const createIdFactory = () => {
  let current = 0
  return () => `${++current}`.padStart(3, '0')
}

async function createAgent(
  identityService: AgentIdentityService,
  verified: boolean,
  ownerId: string,
): Promise<AgentId> {
  const identity = await identityService.issue({
    tenantId: 'tenant-1',
    ownerId,
    ownerType: 'user',
    role: AgentRole.Worker,
  })

  if (verified) {
    await identityService.verify(identity.agentId)
  }

  return identity.agentId
}

describe('WalletBindingService', () => {
  it('binds wallet to verified agent', async () => {
    const auditLog = new TrustAuditLog()
    const identityService = new AgentIdentityService(auditLog)
    const walletBindingService = new WalletBindingService(
      identityService,
      auditLog,
      { now: () => FIXED_NOW, idFactory: createIdFactory() },
    )

    const agentId = await createAgent(identityService, true, 'verified-owner-1')
    await walletBindingService.bindWallet(agentId, 'wallet-1')

    await expect(walletBindingService.listWalletsForAgent(agentId)).resolves.toEqual([
      'wallet-1',
    ])
  })

  it('unbinds wallet and removes binding', async () => {
    const auditLog = new TrustAuditLog()
    const identityService = new AgentIdentityService(auditLog)
    const walletBindingService = new WalletBindingService(
      identityService,
      auditLog,
      { now: () => FIXED_NOW, idFactory: createIdFactory() },
    )

    const agentId = await createAgent(identityService, true, 'verified-owner-1')
    await walletBindingService.bindWallet(agentId, 'wallet-1')
    await walletBindingService.unbindWallet('wallet-1')

    await expect(walletBindingService.listWalletsForAgent(agentId)).resolves.toEqual(
      [],
    )
  })

  it('lists wallets by agent', async () => {
    const auditLog = new TrustAuditLog()
    const identityService = new AgentIdentityService(auditLog)
    const walletBindingService = new WalletBindingService(
      identityService,
      auditLog,
      { now: () => FIXED_NOW, idFactory: createIdFactory() },
    )

    const agentId = await createAgent(identityService, true, 'verified-owner-1')
    await walletBindingService.bindWallet(agentId, 'wallet-a')
    await walletBindingService.bindWallet(agentId, 'wallet-b')

    await expect(walletBindingService.listWalletsForAgent(agentId)).resolves.toEqual([
      'wallet-a',
      'wallet-b',
    ])
  })

  it('lists agent by wallet', async () => {
    const auditLog = new TrustAuditLog()
    const identityService = new AgentIdentityService(auditLog)
    const walletBindingService = new WalletBindingService(
      identityService,
      auditLog,
      { now: () => FIXED_NOW, idFactory: createIdFactory() },
    )

    const agentId = await createAgent(identityService, true, 'verified-owner-1')
    await walletBindingService.bindWallet(agentId, 'wallet-1')

    await expect(walletBindingService.listAgentsForWallet('wallet-1')).resolves.toEqual(
      [agentId],
    )
  })

  it('rejects bind for unverified agent', async () => {
    const auditLog = new TrustAuditLog()
    const identityService = new AgentIdentityService(auditLog)
    const walletBindingService = new WalletBindingService(
      identityService,
      auditLog,
      { now: () => FIXED_NOW, idFactory: createIdFactory() },
    )

    const unverifiedAgentId = await createAgent(
      identityService,
      false,
      'unverified-owner-1',
    )

    await expect(
      walletBindingService.bindWallet(unverifiedAgentId, 'wallet-1'),
    ).rejects.toThrow('must be verified')
  })

  it('rejects wallet double-binding', async () => {
    const auditLog = new TrustAuditLog()
    const identityService = new AgentIdentityService(auditLog)
    const walletBindingService = new WalletBindingService(
      identityService,
      auditLog,
      { now: () => FIXED_NOW, idFactory: createIdFactory() },
    )

    const firstAgentId = await createAgent(identityService, true, 'verified-owner-1')
    const secondAgentId = await createAgent(identityService, true, 'verified-owner-2')

    await walletBindingService.bindWallet(firstAgentId, 'wallet-1')

    await expect(
      walletBindingService.bindWallet(secondAgentId, 'wallet-1'),
    ).rejects.toThrow('Wallet already bound')
  })
})
