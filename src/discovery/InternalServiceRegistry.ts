import { ExternalCapabilityManifest } from '../shared/types'

export interface ServiceQuery {
    tenantId: string
    serviceName?: string
    operation?: string
    authScheme?: 'api_key' | 'oauth' | 'a402' | 'internal_only'
    paymentRail?: 'stripe' | 'x402' | 'mcp_pay'
    version?: 'latest' | string
}

export class InternalServiceRegistry {
    // Keyed by manifestId
    private registry: Map<string, ExternalCapabilityManifest> = new Map()

    register(manifest: ExternalCapabilityManifest): void {
        this.registry.set(manifest.manifestId, manifest)
    }

    query(q: ServiceQuery): ExternalCapabilityManifest[] {
        let results = Array.from(this.registry.values()).filter(m => m.tenantId === q.tenantId)

        if (q.serviceName) {
            results = results.filter(m => m.serviceName === q.serviceName)
        }
        if (q.operation) {
            results = results.filter(m => m.supportedOperations.includes(q.operation!))
        }
        if (q.authScheme) {
            results = results.filter(m => m.authScheme === q.authScheme)
        }
        if (q.paymentRail) {
            results = results.filter(m => m.paymentRail === q.paymentRail)
        }

        if (q.version) {
            if (q.version === 'latest') {
                // Group by serviceName, then find latest version
                const latestByService = new Map<string, ExternalCapabilityManifest>()
                for (const manifest of results) {
                    const currentLatest = latestByService.get(manifest.serviceName)
                    if (!currentLatest || this.compareVersions(manifest.version, currentLatest.version) > 0) {
                        latestByService.set(manifest.serviceName, manifest)
                    }
                }
                results = Array.from(latestByService.values())
            } else {
                results = results.filter(m => m.version === q.version)
            }
        }

        // Sort by reliability score descending
        results.sort((a, b) => (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0))

        return results
    }

    // Simple version comparison assuming semantic versioning format (e.g. "1.0.0", "1.1.0")
    private compareVersions(v1: string, v2: string): number {
        const p1 = v1.split('.').map(Number)
        const p2 = v2.split('.').map(Number)
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const n1 = p1[i] || 0
            const n2 = p2[i] || 0
            if (n1 !== n2) {
                return n1 - n2
            }
        }
        return 0
    }
}
