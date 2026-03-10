import { describe, it, expect, beforeEach } from 'vitest'
import { DiscoveryPolicyEngine, DiscoveryPolicyConfig } from './DiscoveryPolicyEngine'
import { ExternalCapabilityManifest, ExternalManifestId } from '../shared/types'

describe('DiscoveryPolicyEngine', () => {
    let engine: DiscoveryPolicyEngine

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
        engine = new DiscoveryPolicyEngine({ minReliabilityScore: 0.8, requiredTrustBadge: 'verified' })
    })

    it('publishable passes when all conditions met', () => {
        const result = engine.evaluate({ ...baseManifest, reliabilityScore: 0.9, trustBadge: 'verified' })
        expect(result.publishable).toBe(true)
        expect(result.reason).toBeUndefined()
    })

    it('internal_only blocked regardless of other conditions', () => {
        const result = engine.evaluate({
            ...baseManifest,
            authScheme: 'internal_only',
            reliabilityScore: 0.9,
            trustBadge: 'verified'
        })
        expect(result.publishable).toBe(false)
        expect(result.reason).toBe('internal_only auth scheme is not publishable')
    })

    it('low reliability blocked', () => {
        const result = engine.evaluate({
            ...baseManifest,
            reliabilityScore: 0.7,
            trustBadge: 'verified'
        })
        expect(result.publishable).toBe(false)
        expect(result.reason).toBe('Reliability score below minimum threshold')
    })

    it('missing reliability score is treated as 0 and blocked', () => {
        const result = engine.evaluate({
            ...baseManifest,
            trustBadge: 'verified'
        })
        expect(result.publishable).toBe(false)
        expect(result.reason).toBe('Reliability score below minimum threshold')
    })

    it('missing badge blocked', () => {
        const result = engine.evaluate({
            ...baseManifest,
            reliabilityScore: 0.9
        })
        expect(result.publishable).toBe(false)
        expect(result.reason).toBe('Missing required trust badge')
    })

    it('custom threshold evaluation', () => {
        const customEngine = new DiscoveryPolicyEngine({ minReliabilityScore: 0.5 })

        // No trust badge required, score is 0.6 >= 0.5
        const result = customEngine.evaluate({
            ...baseManifest,
            reliabilityScore: 0.6
        })
        expect(result.publishable).toBe(true)
    })

    it('all filtered equals empty on list', () => {
        const customEngine = new DiscoveryPolicyEngine({ minReliabilityScore: 0.99 })
        const filtered = [
            { ...baseManifest, reliabilityScore: 0.5 },
            { ...baseManifest, reliabilityScore: 0.8 },
            { ...baseManifest, authScheme: 'internal_only', reliabilityScore: 0.99 } as ExternalCapabilityManifest
        ].filter(m => customEngine.evaluate(m).publishable)

        expect(filtered.length).toBe(0)
    })
})
