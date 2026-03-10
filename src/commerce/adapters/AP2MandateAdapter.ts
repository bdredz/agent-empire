import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import { Mandate } from '@shared/types'

export interface AP2AuthorizationChain {
  protocol: 'ap2'
  version: '1.0'
  tenantId: string
  businessUnitId?: string
  mandateId: string
  principalId: string
  delegatedAgentId: string
  scope: string[]
  expiresAt: string
  status: Mandate['status']
}

export interface AP2AuthorizationProof {
  proofId: string
  mandateId: string
  actorId: string
  chainHash: string
  createdAt: string
  algorithm: 'sha256'
}

export interface AP2MandateAdapterOptions {
  now?: () => Date
  idFactory?: () => string
}

export class AP2MandateAdapter {
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(options: Partial<AP2MandateAdapterOptions> = {}) {
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => nanoid())
  }

  public mapMandateToChain(mandate: Mandate): AP2AuthorizationChain {
    return {
      protocol: 'ap2',
      version: '1.0',
      tenantId: mandate.tenantId,
      businessUnitId: mandate.businessUnitId,
      mandateId: mandate.mandateId,
      principalId: mandate.principalId,
      delegatedAgentId: mandate.delegatedAgentId,
      scope: [...mandate.scope],
      expiresAt: mandate.expiresAt,
      status: mandate.status,
    }
  }

  public validateDelegationChain(chain: AP2AuthorizationChain): void {
    if (chain.status === 'revoked') {
      throw new Error(`Mandate revoked: ${chain.mandateId}`)
    }
    if (chain.status !== 'active') {
      throw new Error(`Mandate is not active: ${chain.status}`)
    }

    const expiration = new Date(chain.expiresAt)
    if (Number.isNaN(expiration.getTime())) {
      throw new Error('Mandate expiration is invalid')
    }
    if (expiration.getTime() <= this.now().getTime()) {
      throw new Error(`Mandate expired: ${chain.mandateId}`)
    }
    if (chain.scope.length === 0) {
      throw new Error(`Mandate scope cannot be empty: ${chain.mandateId}`)
    }
  }

  public validateScope(chain: AP2AuthorizationChain, requiredScope: string): void {
    const normalizedScope = requiredScope.trim()
    if (normalizedScope.length === 0) {
      throw new Error('Required scope must be provided')
    }

    const hasScope = chain.scope.includes('*') || chain.scope.includes(normalizedScope)
    if (!hasScope) {
      throw new Error(`Scope not authorized: ${normalizedScope}`)
    }
  }

  public generateAuthorizationProof(
    chain: AP2AuthorizationChain,
    actorId: string,
  ): AP2AuthorizationProof {
    this.validateDelegationChain(chain)

    const createdAt = this.now().toISOString()
    const payload = JSON.stringify({ chain, actorId, createdAt })
    const chainHash = createHash('sha256').update(payload).digest('hex')

    return {
      proofId: `ap2_proof_${this.idFactory()}`,
      mandateId: chain.mandateId,
      actorId,
      chainHash,
      createdAt,
      algorithm: 'sha256',
    }
  }

  public authorize(
    mandate: Mandate,
    requiredScope: string,
    actorId: string,
  ): AP2AuthorizationProof {
    const chain = this.mapMandateToChain(mandate)
    this.validateDelegationChain(chain)
    this.validateScope(chain, requiredScope)
    return this.generateAuthorizationProof(chain, actorId)
  }
}
