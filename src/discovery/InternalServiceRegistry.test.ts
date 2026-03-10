import { describe, it, expect, beforeEach } from 'vitest'
import { InternalServiceRegistry, ServiceQuery } from './InternalServiceRegistry'
import { ExternalCapabilityManifest, ExternalManifestId } from '../shared/types'

describe('InternalServiceRegistry', () => {
    let registry: InternalServiceRegistry

    beforeEach(() => {
        registry = new InternalServiceRegistry()
    })

    const baseManifest: ExternalCapabilityManifest = {
        manifestId: 'manifest-1' as ExternalManifestId,
        tenantId: 'tenant-1',
        businessUnitId: 'bu-1',
        serviceName: 'search-service',
        version: '1.0.0',
        baseUrl: 'https://search.local',
        authScheme: 'api_key',
        supportedOperations: ['search', 'index'],
        createdAt: new Date().toISOString()
    }

    it('registers and retrieves manifest by tenantId', () => {
        registry.register(baseManifest)
        const results = registry.query({ tenantId: 'tenant-1' })
        expect(results.length).toBe(1)
        expect(results[0]!.manifestId).toBe('manifest-1')
    })

    it('enforces tenant isolation', () => {
        registry.register(baseManifest)
        const results = registry.query({ tenantId: 'tenant-2' })
        expect(results.length).toBe(0)
    })

    it('queries by exact service name', () => {
        registry.register(baseManifest)
        registry.register({ ...baseManifest, manifestId: 'm2' as ExternalManifestId, serviceName: 'other-service' })
        const results = registry.query({ tenantId: 'tenant-1', serviceName: 'search-service' })
        expect(results.length).toBe(1)
    })

    it('queries by supported operation', () => {
        registry.register(baseManifest)
        registry.register({ ...baseManifest, manifestId: 'm2' as ExternalManifestId, supportedOperations: ['auth'] })
        const results = registry.query({ tenantId: 'tenant-1', operation: 'search' })
        expect(results.length).toBe(1)
        expect(results[0]!.manifestId).toBe('manifest-1')
    })

    it('queries by auth scheme', () => {
        registry.register({ ...baseManifest, manifestId: 'm1' as ExternalManifestId, authScheme: 'api_key' })
        registry.register({ ...baseManifest, manifestId: 'm2' as ExternalManifestId, authScheme: 'oauth' })
        const results = registry.query({ tenantId: 'tenant-1', authScheme: 'oauth' })
        expect(results.length).toBe(1)
        expect(results[0]!.manifestId).toBe('m2')
    })

    it('filters to latest version', () => {
        registry.register({ ...baseManifest, manifestId: 'm1' as ExternalManifestId, version: '1.0.0' })
        registry.register({ ...baseManifest, manifestId: 'm2' as ExternalManifestId, version: '1.1.0' })
        registry.register({ ...baseManifest, manifestId: 'm3' as ExternalManifestId, version: '2.0.0' })
        registry.register({ ...baseManifest, manifestId: 'm4' as ExternalManifestId, serviceName: 'other', version: '0.1.0' })

        const results = registry.query({ tenantId: 'tenant-1', version: 'latest' })
        expect(results.length).toBe(2) // One for search-service, one for other

        const searchLatest = results.find(r => r.serviceName === 'search-service')
        expect(searchLatest?.version).toBe('2.0.0')
    })

    it('filters to specific version', () => {
        registry.register({ ...baseManifest, manifestId: 'm1' as ExternalManifestId, version: '1.0.0' })
        registry.register({ ...baseManifest, manifestId: 'm2' as ExternalManifestId, version: '1.1.0' })

        const results = registry.query({ tenantId: 'tenant-1', version: '1.0.0' })
        expect(results.length).toBe(1)
        expect(results[0]!.version).toBe('1.0.0')
    })

    it('sorts by reliability score descending', () => {
        registry.register({ ...baseManifest, manifestId: 'm1' as ExternalManifestId, reliabilityScore: 0.5 })
        registry.register({ ...baseManifest, manifestId: 'm2' as ExternalManifestId, reliabilityScore: 0.9 })
        registry.register({ ...baseManifest, manifestId: 'm3' as ExternalManifestId, reliabilityScore: 0.2 })

        const results = registry.query({ tenantId: 'tenant-1' })
        expect(results.length).toBe(3)
        expect(results[0]!.reliabilityScore).toBe(0.9)
        expect(results[1]!.reliabilityScore).toBe(0.5)
        expect(results[2]!.reliabilityScore).toBe(0.2)
    })

    it('overwrites previous manifest with same manifestId on duplicate update', () => {
        registry.register({ ...baseManifest, manifestId: 'm1' as ExternalManifestId, reliabilityScore: 0.5 })
        // Duplicate update
        registry.register({ ...baseManifest, manifestId: 'm1' as ExternalManifestId, reliabilityScore: 0.8 })

        const results = registry.query({ tenantId: 'tenant-1' })
        expect(results.length).toBe(1)
        expect(results[0]!.reliabilityScore).toBe(0.8)
    })
})
