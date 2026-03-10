import { InternalServiceRegistry } from './InternalServiceRegistry'
import { DiscoveryPolicyEngine } from './DiscoveryPolicyEngine'

export interface PublishedServiceDescriptor {
    serviceName: string
    version: string
    baseUrl: string
    authScheme: string
    paymentRail?: string
    operations: string[]
    trustBadge?: string
}

export interface PublishedManifestPayload {
    version: string
    services: PublishedServiceDescriptor[]
}

export class ExternalManifestPublisher {
    constructor(
        private registry: InternalServiceRegistry,
        private policyEngine: DiscoveryPolicyEngine
    ) { }

    /**
     * Generates `.well-known/agent-services.json` manifest structure.
     * Returns a JSON string, does NOT write files.
     */
    publish(tenantId: string): string {
        const allServices = this.registry.query({ tenantId })
        const publishableServices = allServices.filter(m => this.policyEngine.evaluate(m).publishable)

        const payload: PublishedManifestPayload = {
            version: '1.0.0', // Manifest format version
            services: publishableServices.map(m => {
                const descriptor: PublishedServiceDescriptor = {
                    serviceName: m.serviceName,
                    version: m.version,
                    baseUrl: m.baseUrl,
                    authScheme: m.authScheme,
                    operations: [...m.supportedOperations],
                }

                if (m.paymentRail) {
                    descriptor.paymentRail = m.paymentRail
                }
                if (m.trustBadge) {
                    descriptor.trustBadge = m.trustBadge
                }

                return descriptor
            })
        }

        return JSON.stringify(payload, null, 2)
    }
}
