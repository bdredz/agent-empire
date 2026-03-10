import { describe, expect, it } from 'vitest'
import {
  AgentRole,
  Mandate,
  createAgentId,
  createMandateId,
} from '@shared/types'
import { AP2MandateAdapter } from './AP2MandateAdapter'

const createIdFactory = () => {
  let current = 0
  return () => `${++current}`.padStart(3, '0')
}

const FIXED_NOW = new Date('2026-03-10T12:00:00.000Z')

const buildMandate = (
  overrides: Partial<Mandate> = {},
): Mandate => ({
  mandateId: createMandateId('mandate-1'),
  tenantId: 'tenant-1',
  principalId: 'principal-1',
  delegatedAgentId: createAgentId('agent-1'),
  purpose: 'pay vendors',
  scope: ['payment_authorize', 'payment_capture'],
  maxAmount: 500,
  currency: 'USD',
  expiresAt: '2026-03-10T13:00:00.000Z',
  status: 'active',
  createdAt: '2026-03-10T11:00:00.000Z',
  ...overrides,
})

describe('AP2MandateAdapter', () => {
  it('maps a mandate to AP2 authorization chain', () => {
    const adapter = new AP2MandateAdapter({ now: () => FIXED_NOW })
    const chain = adapter.mapMandateToChain(buildMandate())

    expect(chain.protocol).toBe('ap2')
    expect(chain.version).toBe('1.0')
    expect(chain.scope).toEqual(['payment_authorize', 'payment_capture'])
  })

  it('validates delegation chains for active non-expired mandates', () => {
    const adapter = new AP2MandateAdapter({ now: () => FIXED_NOW })
    const chain = adapter.mapMandateToChain(buildMandate())

    expect(() => adapter.validateDelegationChain(chain)).not.toThrow()
  })

  it('rejects expired mandates', () => {
    const adapter = new AP2MandateAdapter({ now: () => FIXED_NOW })
    const chain = adapter.mapMandateToChain(
      buildMandate({ expiresAt: '2026-03-10T11:59:59.000Z' }),
    )

    expect(() => adapter.validateDelegationChain(chain)).toThrow('Mandate expired')
  })

  it('rejects revoked mandates', () => {
    const adapter = new AP2MandateAdapter({ now: () => FIXED_NOW })
    const chain = adapter.mapMandateToChain(buildMandate({ status: 'revoked' }))

    expect(() => adapter.validateDelegationChain(chain)).toThrow('Mandate revoked')
  })

  it('generates an authorization proof', () => {
    const adapter = new AP2MandateAdapter({
      now: () => FIXED_NOW,
      idFactory: createIdFactory(),
    })

    const chain = adapter.mapMandateToChain(buildMandate())
    const proof = adapter.generateAuthorizationProof(chain, AgentRole.Worker)

    expect(proof.proofId).toBe('ap2_proof_001')
    expect(proof.algorithm).toBe('sha256')
    expect(proof.chainHash).toHaveLength(64)
    expect(proof.createdAt).toBe(FIXED_NOW.toISOString())
  })

  it('validates required scope during authorization', () => {
    const adapter = new AP2MandateAdapter({ now: () => FIXED_NOW })
    const mandate = buildMandate({ scope: ['payment_capture'] })

    expect(() =>
      adapter.authorize(mandate, 'payment_authorize', AgentRole.Worker),
    ).toThrow('Scope not authorized')
  })

  it('accepts wildcard scope during authorization', () => {
    const adapter = new AP2MandateAdapter({ now: () => FIXED_NOW })
    const mandate = buildMandate({ scope: ['*'] })

    expect(() =>
      adapter.authorize(mandate, 'payment_authorize', AgentRole.Worker),
    ).not.toThrow()
  })
})
