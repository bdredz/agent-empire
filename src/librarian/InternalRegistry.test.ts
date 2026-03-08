import { describe, expect, it } from 'vitest'
import type { CapabilityManifest } from '@shared/types'
import { InternalRegistry } from './InternalRegistry'

function makeManifest(overrides: Partial<CapabilityManifest> = {}): CapabilityManifest {
  return {
    manifestId: 'manifest-1',
    tenantId: 'tenant-1',
    businessUnitId: 'biz-1',
    serviceName: 'ApiGateway',
    version: '1.0.0',
    baseUrl: 'https://api.example.com',
    authScheme: 'api_key',
    supportedOperations: ['invoke'],
    createdAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('InternalRegistry', () => {
  it('upserts and lists manifests by tenant', () => {
    const registry = new InternalRegistry()
    registry.upsert(makeManifest())
    registry.upsert(makeManifest({ manifestId: 'manifest-2', tenantId: 'tenant-2' }))

    const tenantOne = registry.listByTenant('tenant-1')

    expect(tenantOne).toHaveLength(1)
    expect(tenantOne[0]?.manifestId).toBe('manifest-1')
  })

  it('filters by business unit', () => {
    const registry = new InternalRegistry()
    registry.upsert(makeManifest())
    registry.upsert(makeManifest({ manifestId: 'manifest-2', businessUnitId: 'biz-2' }))

    const manifests = registry.listByBusinessUnit('tenant-1', 'biz-2')

    expect(manifests).toHaveLength(1)
    expect(manifests[0]?.manifestId).toBe('manifest-2')
  })

  it('finds by service name case-insensitively', () => {
    const registry = new InternalRegistry()
    registry.upsert(makeManifest({ serviceName: 'ApiGateway' }))

    const manifests = registry.findByService('tenant-1', 'apigateway')

    expect(manifests).toHaveLength(1)
  })

  it('replaces existing manifest with same tenant+id', () => {
    const registry = new InternalRegistry()
    registry.upsert(makeManifest({ version: '1.0.0' }))
    registry.upsert(makeManifest({ version: '2.0.0' }))

    const manifests = registry.listByTenant('tenant-1')

    expect(manifests).toHaveLength(1)
    expect(manifests[0]?.version).toBe('2.0.0')
  })
})
