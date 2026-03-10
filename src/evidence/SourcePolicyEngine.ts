export type TrustTier = 'tier_1' | 'tier_2' | 'tier_3'

export interface SourcePolicy {
    allowedDomains?: string[]
    deniedDomains?: string[]
    allowedCategories?: string[]
    deniedCategories?: string[]
    tierOverrides?: Record<string, TrustTier>
    highRiskDomains?: string[]
    recencyRequirements?: Record<string, string>
}

export interface SourcePolicyRequest {
    url: string
    category?: string
    questionType?: string
}

export interface SourcePolicyResult {
    allowed: boolean
    tier: string
    reason?: string
    escalate?: boolean
    requiredRecency?: string
}

export class SourcePolicyEngine {
    constructor(private readonly policy: SourcePolicy) { }

    private matchesDomainList(url: string, domains?: string[]): boolean {
        if (!domains || domains.length === 0) return false

        let hostname = url
        try {
            hostname = new URL(url).hostname
        } catch {
            // Allow raw hostnames to pass through for matching
        }

        return domains.some((domain) => {
            if (domain.startsWith('*.')) {
                const suffix = domain.slice(2)
                return hostname === suffix || hostname.endsWith('.' + suffix)
            }
            return hostname === domain
        })
    }

    evaluate(request: SourcePolicyRequest): SourcePolicyResult {
        const { url, category, questionType } = request

        // 1. Check deny lists
        if (this.matchesDomainList(url, this.policy.deniedDomains)) {
            return { allowed: false, tier: 'tier_3', reason: 'Domain is denied' }
        }

        if (category && this.policy.deniedCategories?.includes(category)) {
            return { allowed: false, tier: 'tier_3', reason: `Category ${category} is denied` }
        }

        // 2. High risk escalation
        let escalate = false
        let reason: string | undefined

        if (this.matchesDomainList(url, this.policy.highRiskDomains)) {
            escalate = true
            reason = 'High risk domain requires escalation'
        }

        // 3. Recency requirement mapping
        let requiredRecency: string | undefined
        if (questionType && this.policy.recencyRequirements?.[questionType]) {
            requiredRecency = this.policy.recencyRequirements[questionType]
        }

        // 4. Check allow lists
        let allowed = false
        let tier: TrustTier = 'tier_3'

        if (
            (!this.policy.allowedDomains || this.policy.allowedDomains.length === 0) &&
            (!this.policy.allowedCategories || this.policy.allowedCategories.length === 0)
        ) {
            // Empty policy allows all but defaults to tier_3
            allowed = true
        } else {
            if (this.matchesDomainList(url, this.policy.allowedDomains)) {
                allowed = true
            }
            if (category && this.policy.allowedCategories?.includes(category)) {
                allowed = true
            }
        }

        if (!allowed && !escalate) {
            return {
                allowed: false,
                tier: 'tier_3',
                reason: 'Domain or category not explicitly allowed',
                ...(requiredRecency ? { requiredRecency } : {})
            }
        }

        // 5. Determine tier from overrides
        let hostname = url
        try {
            hostname = new URL(url).hostname
        } catch {
            // Ignore
        }

        if (this.policy.tierOverrides) {
            for (const [domain, overrideTier] of Object.entries(this.policy.tierOverrides)) {
                if (domain.startsWith('*.')) {
                    const suffix = domain.slice(2)
                    if (hostname === suffix || hostname.endsWith('.' + suffix)) {
                        tier = overrideTier
                        break
                    }
                } else if (hostname === domain) {
                    tier = overrideTier
                    break
                }
            }
        }

        return {
            allowed: allowed || escalate, // escalate bypasses absolute block, sends to manual review
            tier,
            ...(escalate ? { escalate: true, reason } : {}),
            ...(requiredRecency ? { requiredRecency } : {})
        }
    }
}
