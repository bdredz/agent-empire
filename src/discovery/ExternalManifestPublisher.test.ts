import { describe, it, expect, beforeEach } from 'vitest'
import { ExternalManifestPublisher, PublishedManifestPayload } from './ExternalManifestPublisher'
import { InternalServiceRegistry } from './InternalServiceRegistry'
import { DiscoveryPolicyEngine } from './DiscoveryPolicyEngine'
import { ExternalCapabilityManifest, ExternalManifestId } from '../shared/types'

describe('ExternalManifestPublisher', () => {
    let registry: InternalServiceRegistry
    let policyEngine: DiscoveryPolicyEngine
    let publisher: ExternalManifestPublisher

    const baseManifest: ExternalCapabilityManifest = {
        manifestId: 'manifest-1' as ExternalManifestId,
        tenantId: 'tenant-1',
        businessUnitId: 'bu-1',
        serviceName: 'search-service',
        version: '1.0.0',
        baseUrl: 'https://search.local',
        authScheme: 'api_key',
        supportedOperations: ['search'],
        createdAt: new Date().toISOString()
    }

    beforeEach(() => {
        registry = new InternalServiceRegistry()
        policyEngine = new DiscoveryPolicyEngine({ minReliabilityScore: 0.8, requiredTrustBadge: 'verified' })
        publisher = new ExternalManifestPublisher(registry, policyEngine)
    })

    it('generates a valid json manifest structure', () => {
        registry.register({ ...baseManifest, reliabilityScore: 0.9, trustBadge: 'verified' })
        const jsonStr = publisher.publish('tenant-1')

        // Should parse without errors
        const payload: PublishedManifestPayload = JSON.parse(jsonStr)
        expect(payload.version).toBe('1.0.0')
        expect(payload.services.length).toBe(1)
    })

    it('filters out private services (internal_only)', () => {
        registry.register({ ...baseManifest, manifestId: 'm1' as ExternalManifestId, authScheme: 'internal_only', reliabilityScore: 0.9, trustBadge: 'verified' })
        registry.register({ ...baseManifest, manifestId: 'm2' as ExternalManifestId, authScheme: 'api_key', serviceName: 'public-service', reliabilityScore: 0.9, trustBadge: 'verified' })

        const jsonStr = publisher.publish('tenant-1')
        const payload: PublishedManifestPayload = JSON.parse(jsonStr)
        expect(payload.services.length).toBe(1)
        expect(payload.services[0]!.serviceName).toBe('public-service')
    })

    it('includes trust metadata in output', () => {
        registry.register({ ...baseManifest, reliabilityScore: 0.9, trustBadge: 'verified', paymentRail: 'mcp_pay' })
        const jsonStr = publisher.publish('tenant-1')
        const payload: PublishedManifestPayload = JSON.parse(jsonStr)

        expect(payload.services[0]!.trustBadge).toBe('verified')
        expect(payload.services[0]!.paymentRail).toBe('mcp_pay')
    })

    it('returns empty services array for empty registry', () => {
        const jsonStr = publisher.publish('tenant-1')
        const payload: PublishedManifestPayload = JSON.parse(jsonStr)

        expect(payload.version).toBe('1.0.0')
        expect(payload.services).toEqual([])
    })

    it('includes version in output payload', () => {
        registry.register({ ...baseManifest, reliabilityScore: 0.9, trustBadge: 'verified', version: '2.5.1' })
        const jsonStr = publisher.publish('tenant-1')
        const payload: PublishedManifestPayload = JSON.parse(jsonStr)

        expect(payload.services[0]!.version).toBe('2.5.1')
    })

    it('reflects auth scheme correctly in the payload', () => {
        registry.register({ ...baseManifest, reliabilityScore: 0.9, trustBadge: 'verified', authScheme: 'oauth' })
        const jsonStr = publisher.publish('tenant-1')
        const payload: PublishedManifestPayload = JSON.parse(jsonStr)

        expect(payload.services[0]!.authScheme).toBe('oauth')
    })
})
