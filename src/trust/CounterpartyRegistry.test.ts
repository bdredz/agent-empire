import { describe, expect, it } from 'vitest'
import { CounterpartyRegistry } from './CounterpartyRegistry'

function createBaseInput(overrides: Record<string, unknown> = {}) {
  return {
    displayName: 'Vendor A',
    counterpartyType: 'merchant' as const,
    trustStatus: 'unknown' as const,
    tags: ['infra'],
    ...overrides,
  }
}

describe('CounterpartyRegistry', () => {
  it('adds counterparty', async () => {
    const registry = new CounterpartyRegistry()

    const counterparty = await registry.add('tenant-1', createBaseInput())

    expect(counterparty.riskScore).toBe(50)
    expect(counterparty.trustStatus).toBe('unknown')
  })

  it('gets by id', async () => {
    const registry = new CounterpartyRegistry()
    const created = await registry.add('tenant-1', createBaseInput())

    const found = await registry.get('tenant-1', created.counterpartyId)

    expect(found?.counterpartyId).toBe(created.counterpartyId)
  })

  it('updates trust status', async () => {
    const registry = new CounterpartyRegistry()
    const created = await registry.add('tenant-1', createBaseInput())

    const trusted = await registry.updateTrustStatus(
      'tenant-1',
      created.counterpartyId,
      'trusted',
    )

    expect(trusted.trustStatus).toBe('trusted')
  })

  it('blocks counterparty via valid transitions', async () => {
    const registry = new CounterpartyRegistry()
    const created = await registry.add('tenant-1', createBaseInput())

    await registry.updateTrustStatus('tenant-1', created.counterpartyId, 'watch')
    const blocked = await registry.updateTrustStatus(
      'tenant-1',
      created.counterpartyId,
      'blocked',
    )

    expect(blocked.trustStatus).toBe('blocked')
  })

  it('filters by type', async () => {
    const registry = new CounterpartyRegistry()
    await registry.add('tenant-1', createBaseInput({ counterpartyType: 'merchant' }))
    await registry.add('tenant-1', createBaseInput({ counterpartyType: 'api_provider' }))

    const merchants = await registry.listByType('tenant-1', 'merchant')

    expect(merchants).toHaveLength(1)
    expect(merchants[0]?.counterpartyType).toBe('merchant')
  })

  it('filters by tag', async () => {
    const registry = new CounterpartyRegistry()
    await registry.add('tenant-1', createBaseInput({ tags: ['infra', 'compute'] }))
    await registry.add('tenant-1', createBaseInput({ tags: ['marketing'] }))

    const tagged = await registry.listByTag('tenant-1', 'compute')

    expect(tagged).toHaveLength(1)
  })

  it('updates risk score from event history', async () => {
    const registry = new CounterpartyRegistry()
    const created = await registry.add('tenant-1', createBaseInput())

    const increased = await registry.recordRiskEvent(
      'tenant-1',
      created.counterpartyId,
      'task_completed',
    )
    const decreased = await registry.recordRiskEvent(
      'tenant-1',
      created.counterpartyId,
      'dispute_filed',
    )

    expect(increased.riskScore).toBe(55)
    expect(decreased.riskScore).toBe(45)
  })

  it('enforces tenant isolation', async () => {
    const registry = new CounterpartyRegistry()
    await registry.add('tenant-1', createBaseInput())
    await registry.add('tenant-2', createBaseInput())

    const tenantOne = await registry.listByTenant('tenant-1')

    expect(tenantOne).toHaveLength(1)
  })

  it('rejects invalid trust status transition', async () => {
    const registry = new CounterpartyRegistry()
    const created = await registry.add('tenant-1', createBaseInput({ trustStatus: 'trusted' }))

    await expect(
      registry.updateTrustStatus('tenant-1', created.counterpartyId, 'blocked'),
    ).rejects.toThrow('Invalid trust status transition: trusted -> blocked')
  })
})
