import { describe, it, expect } from 'vitest'
import { SourcePolicyEngine } from './SourcePolicyEngine.js'

describe('SourcePolicyEngine', () => {
    it('allows implicitly matching domains when policy is empty (tier_3 default)', () => {
        const engine = new SourcePolicyEngine({})
        const result = engine.evaluate({ url: 'https://any-domain.com' })
        expect(result.allowed).toBe(true)
        expect(result.tier).toBe('tier_3')
        expect(result.escalate).toBeUndefined()
    })

    it('allows explicitly allowed domains', () => {
        const engine = new SourcePolicyEngine({
            allowedDomains: ['example.com'],
        })
        const result = engine.evaluate({ url: 'https://example.com/article/123' })
        expect(result.allowed).toBe(true)
        expect(result.tier).toBe('tier_3') // default tier if no overrides
    })

    it('blocks implicitly denied domains when allow lists exist', () => {
        const engine = new SourcePolicyEngine({
            allowedDomains: ['safe.com'],
        })
        const result = engine.evaluate({ url: 'https://example.com' })
        expect(result.allowed).toBe(false)
        expect(result.tier).toBe('tier_3')
        expect(result.reason).toBe('Domain or category not explicitly allowed')
    })

    it('blocks explicitly denied domains', () => {
        const engine = new SourcePolicyEngine({
            deniedDomains: ['spam.com'],
        })
        const result = engine.evaluate({ url: 'https://spam.com/cheap-stuff' })
        expect(result.allowed).toBe(false)
        expect(result.reason).toBe('Domain is denied')
    })

    it('filters based on category', () => {
        const engine = new SourcePolicyEngine({
            allowedCategories: ['academic'],
            deniedCategories: ['social_media']
        })

        // allowed category
        const result1 = engine.evaluate({ url: 'https://university.edu', category: 'academic' })
        expect(result1.allowed).toBe(true)

        // denied category
        const result2 = engine.evaluate({ url: 'https://twitter.com', category: 'social_media' })
        expect(result2.allowed).toBe(false)
        expect(result2.reason).toBe('Category social_media is denied')

        // missing category not allowed
        const result3 = engine.evaluate({ url: 'https://unknown.com' })
        expect(result3.allowed).toBe(false)
    })

    it('assigns overridden trust tiers based on domain', () => {
        const engine = new SourcePolicyEngine({
            tierOverrides: {
                'authoritative.gov': 'tier_1',
                'reputable.com': 'tier_2'
            }
        })

        const res1 = engine.evaluate({ url: 'https://authoritative.gov/data' })
        expect(res1.allowed).toBe(true)
        expect(res1.tier).toBe('tier_1')

        const res2 = engine.evaluate({ url: 'https://reputable.com/news' })
        expect(res2.allowed).toBe(true)
        expect(res2.tier).toBe('tier_2')
    })

    it('includes recency requirement for specific question types', () => {
        const engine = new SourcePolicyEngine({
            recencyRequirements: {
                'financial': 'realtime',
                'history': 'any'
            }
        })

        const result = engine.evaluate({ url: 'https://example.com', questionType: 'financial' })
        expect(result.allowed).toBe(true)
        expect(result.requiredRecency).toBe('realtime')
    })

    it('escalates high-risk domains and overrides absolute denial', () => {
        const engine = new SourcePolicyEngine({
            highRiskDomains: ['medical-advice.com']
        })

        const result = engine.evaluate({ url: 'https://medical-advice.com/tips' })
        // Even if there was no explicit allow lists, the high-risk domain puts it in escalate mode instead of false allowing
        // Wait, by our logic escalate -> allowed becomes true so it goes to human.
        expect(result.allowed).toBe(true)
        expect(result.escalate).toBe(true)
        expect(result.reason).toBe('High risk domain requires escalation')
    })

    it('supports wildcard domain matching', () => {
        const engine = new SourcePolicyEngine({
            allowedDomains: ['*.gov'],
            tierOverrides: {
                '*.gov': 'tier_1'
            }
        })

        // Subdomain matches *.gov
        const res1 = engine.evaluate({ url: 'https://cdc.gov/data' })
        expect(res1.allowed).toBe(true)
        expect(res1.tier).toBe('tier_1')

        // Base domain matches *.gov
        const res2 = engine.evaluate({ url: 'https://gov/data' })
        expect(res2.allowed).toBe(true)
        // Yes: "cdc.gov" matches "*.gov" because suffix is "gov".
    })
})
