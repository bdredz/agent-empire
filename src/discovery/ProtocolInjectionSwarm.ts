export interface ExternalRegistryConfig {
    registryId: string
    url: string
}

export type SubmissionStatus = 'pending' | 'submitted' | 'confirmed' | 'drifted'

export interface SubmissionReport {
    manifestId: string
    registryId: string
    status: SubmissionStatus
    submittedAt: string
    driftDetails?: string
}

export class ProtocolInjectionSwarm {
    // Map of manifestId -> (registryId -> SubmissionReport)
    private statusTracker = new Map<string, Map<string, SubmissionReport>>()

    // Track payload footprint to detect drift
    private submittedPayloads = new Map<string, string>()

    constructor(private targetRegistries: ExternalRegistryConfig[]) { }

    /**
     * Generates a registration payload wrapper representing the data that 
     * would be submitted to external registries.
     */
    generatePayload(serviceName: string, manifestJson: string): string {
        return JSON.stringify({
            operation: 'register',
            target: serviceName,
            agentServices: JSON.parse(manifestJson)
        })
    }

    /**
     * Records tracking status for target submissions but does NOT fire off 
     * real network requests in Phase 3.
     */
    submit(manifestId: string, payloadStr: string): SubmissionReport[] {
        const reports: SubmissionReport[] = []

        // Detect drift
        let isDrifted = false
        const previousPayload = this.submittedPayloads.get(manifestId)
        if (previousPayload && previousPayload !== payloadStr) {
            isDrifted = true
        }

        this.submittedPayloads.set(manifestId, payloadStr)

        for (const registry of this.targetRegistries) {
            if (!this.statusTracker.has(manifestId)) {
                this.statusTracker.set(manifestId, new Map())
            }

            const registryMap = this.statusTracker.get(manifestId)!
            const existingReport = registryMap.get(registry.registryId)

            let newStatus: SubmissionStatus = 'submitted'

            // Keep confirmed status unless drift is detected
            if (existingReport && existingReport.status === 'confirmed') {
                newStatus = isDrifted ? 'drifted' : 'confirmed'
            } else if (existingReport && isDrifted) {
                newStatus = 'drifted'
            }

            const report: SubmissionReport = {
                manifestId,
                registryId: registry.registryId,
                status: newStatus,
                submittedAt: new Date().toISOString(),
                ...(isDrifted ? { driftDetails: 'Payload changed since last submission' } : {})
            }

            registryMap.set(registry.registryId, report)
            reports.push(report)
        }

        return reports
    }

    confirm(manifestId: string, registryId: string): SubmissionReport | undefined {
        const registryMap = this.statusTracker.get(manifestId)
        if (!registryMap) return undefined

        const existingReport = registryMap.get(registryId)
        if (!existingReport) return undefined

        const updatedReport = { ...existingReport, status: 'confirmed' as SubmissionStatus }
        registryMap.set(registryId, updatedReport)

        return updatedReport
    }

    getSubmissionStatus(manifestId: string, registryId: string): SubmissionReport | undefined {
        return this.statusTracker.get(manifestId)?.get(registryId)
    }
}
