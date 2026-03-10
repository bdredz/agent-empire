import { ExternalCapabilityManifest } from '../shared/types'

export interface DiscoveryPolicyConfig {
    minReliabilityScore: number
    requiredTrustBadge?: string
}

export class DiscoveryPolicyEngine {
    constructor(private config: DiscoveryPolicyConfig) { }

    evaluate(manifest: ExternalCapabilityManifest): { publishable: boolean; reason?: string } {
        if (manifest.authScheme === 'internal_only') {
            return { publishable: false, reason: 'internal_only auth scheme is not publishable' }
        }

        const score = manifest.reliabilityScore ?? 0
        if (score < this.config.minReliabilityScore) {
            return { publishable: false, reason: 'Reliability score below minimum threshold' }
        }

        if (this.config.requiredTrustBadge && manifest.trustBadge !== this.config.requiredTrustBadge) {
            return { publishable: false, reason: 'Missing required trust badge' }
        }

        return { publishable: true }
    }
}
