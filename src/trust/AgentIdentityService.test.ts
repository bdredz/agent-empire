import { describe, expect, it } from 'vitest'
import { AgentIdentityService } from './AgentIdentityService'
import { TrustAuditLog } from './TrustAuditLog'

describe('AgentIdentityService', () => {
  it('issues identity', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())

    const identity = await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-1',
      ownerType: 'user',
      role: 'worker',
    })

    expect(identity.verificationStatus).toBe('unverified')
    expect(identity.walletBindings).toEqual([])
  })

  it('gets by id', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())
    const created = await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-2',
      ownerType: 'user',
      role: 'worker',
    })

    const found = await service.get(created.agentId)

    expect(found?.agentId).toBe(created.agentId)
  })

  it('verifies identity', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())
    const created = await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-3',
      ownerType: 'organization',
      role: 'worker',
    })

    const verified = await service.verify(created.agentId)

    expect(verified.verificationStatus).toBe('verified')
  })

  it('restricts identity after verify', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())
    const created = await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-4',
      ownerType: 'system',
      role: 'worker',
    })

    await service.verify(created.agentId)
    const restricted = await service.restrict(created.agentId, 'policy risk')

    expect(restricted.verificationStatus).toBe('restricted')
  })

  it('revokes identity', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())
    const created = await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-5',
      ownerType: 'user',
      role: 'worker',
    })

    const revoked = await service.revoke(created.agentId, 'incident')

    expect(revoked.verificationStatus).toBe('revoked')
  })

  it('binds wallet', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())
    const created = await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-6',
      ownerType: 'user',
      role: 'worker',
    })

    const updated = await service.bindWallet(created.agentId, 'wallet-1')

    expect(updated.walletBindings).toEqual(['wallet-1'])
  })

  it('lists by tenant', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())

    await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-7',
      ownerType: 'user',
      role: 'worker',
    })
    await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-8',
      ownerType: 'organization',
      role: 'mechanic',
    })

    const identities = await service.listByTenant('tenant-1')

    expect(identities).toHaveLength(2)
  })

  it('enforces tenant isolation', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())

    await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-9',
      ownerType: 'user',
      role: 'worker',
    })
    await service.issue({
      tenantId: 'tenant-2',
      ownerId: 'owner-10',
      ownerType: 'user',
      role: 'worker',
    })

    const tenantOne = await service.listByTenant('tenant-1')

    expect(tenantOne).toHaveLength(1)
    expect(tenantOne[0]?.tenantId).toBe('tenant-1')
  })

  it('rejects invalid transition to restricted from unverified', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())
    const created = await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-11',
      ownerType: 'user',
      role: 'worker',
    })

    await expect(service.restrict(created.agentId, 'invalid')).rejects.toThrow(
      'Only verified identities can be restricted',
    )
  })

  it('rejects duplicate issue', async () => {
    const service = new AgentIdentityService(new TrustAuditLog())

    await service.issue({
      tenantId: 'tenant-1',
      ownerId: 'owner-12',
      ownerType: 'user',
      role: 'worker',
      businessUnitId: 'biz-1',
    })

    await expect(
      service.issue({
        tenantId: 'tenant-1',
        ownerId: 'owner-12',
        ownerType: 'user',
        role: 'worker',
        businessUnitId: 'biz-1',
      }),
    ).rejects.toThrow('Agent identity already exists for owner and role')
  })
})
