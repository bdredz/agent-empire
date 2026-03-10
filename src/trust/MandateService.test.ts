import { describe, expect, it } from 'vitest'
import { createAgentId } from '@shared/types'
import { MandateService } from './MandateService'
import { TrustAuditLog } from './TrustAuditLog'

function buildService() {
  return new MandateService(new TrustAuditLog())
}

function baseMandateParams(overrides: Partial<Parameters<MandateService['create']>[0]> = {}) {
  return {
    tenantId: 'tenant-1',
    businessUnitId: 'biz-1',
    principalId: 'principal-1',
    delegatedAgentId: createAgentId('agent-1'),
    purpose: 'pay vendors',
    scope: ['payment'],
    maxAmount: 100,
    currency: 'USD',
    allowedMerchants: ['merchant-a'],
    allowedCategories: ['infra'],
    expiresAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('MandateService', () => {
  it('creates mandate', async () => {
    const service = buildService()
    const mandate = await service.create(baseMandateParams())

    expect(mandate.status).toBe('active')
  })

  it('validates within scope and constraints', async () => {
    const service = buildService()
    const mandate = await service.create(baseMandateParams())

    const result = await service.validate(mandate.mandateId, {
      amount: 90,
      merchant: 'merchant-a',
      category: 'infra',
    })

    expect(result).toEqual({ valid: true })
  })

  it('rejects amount over max', async () => {
    const service = buildService()
    const mandate = await service.create(baseMandateParams())

    const result = await service.validate(mandate.mandateId, { amount: 101 })

    expect(result).toEqual({ valid: false, reason: 'amount_exceeded' })
  })

  it('rejects expired mandate', async () => {
    const service = buildService()
    const mandate = await service.create(
      baseMandateParams({ expiresAt: '2000-01-01T00:00:00.000Z' }),
    )

    const result = await service.validate(mandate.mandateId, { amount: 10 })

    expect(result).toEqual({ valid: false, reason: 'expired' })
  })

  it('rejects wrong merchant', async () => {
    const service = buildService()
    const mandate = await service.create(baseMandateParams())

    const result = await service.validate(mandate.mandateId, {
      merchant: 'merchant-b',
    })

    expect(result).toEqual({ valid: false, reason: 'merchant_not_allowed' })
  })

  it('revokes mandate irreversibly', async () => {
    const service = buildService()
    const mandate = await service.create(baseMandateParams())

    await service.revoke(mandate.mandateId)
    const result = await service.validate(mandate.mandateId, { amount: 10 })

    expect(result).toEqual({ valid: false, reason: 'revoked' })
  })

  it('consumes mandate once', async () => {
    const service = buildService()
    const mandate = await service.create(baseMandateParams())

    const consumed = await service.consume(mandate.mandateId)

    expect(consumed.status).toBe('consumed')
    await expect(service.consume(mandate.mandateId)).rejects.toThrow(
      'Consumed mandate cannot be consumed again',
    )
  })

  it('lists by agent', async () => {
    const service = buildService()
    await service.create(baseMandateParams({ delegatedAgentId: createAgentId('agent-1') }))
    await service.create(baseMandateParams({ delegatedAgentId: createAgentId('agent-2') }))

    const mandates = await service.listByAgent(createAgentId('agent-2'))

    expect(mandates).toHaveLength(1)
    expect(mandates[0]?.delegatedAgentId).toBe(createAgentId('agent-2'))
  })

  it('lists active by tenant only', async () => {
    const service = buildService()
    await service.create(baseMandateParams({ tenantId: 'tenant-1' }))
    await service.create(baseMandateParams({ tenantId: 'tenant-2' }))

    const mandates = await service.listActive('tenant-1')

    expect(mandates).toHaveLength(1)
    expect(mandates[0]?.tenantId).toBe('tenant-1')
  })

  it('rejects out-of-scope mandate', async () => {
    const service = buildService()
    const mandate = await service.create(baseMandateParams({ scope: ['read_only'] }))

    const result = await service.validate(mandate.mandateId, { amount: 10 })

    expect(result).toEqual({ valid: false, reason: 'out_of_scope' })
  })
})
