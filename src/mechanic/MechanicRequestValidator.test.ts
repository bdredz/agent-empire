import { describe, expect, it } from 'vitest'
import type { MechanicRequest } from '@shared/types'
import { MechanicRequestValidator } from './MechanicRequestValidator'

function makeRequest(overrides: Partial<MechanicRequest> = {}): MechanicRequest {
  return {
    requestId: 'req-1',
    tenantId: 'tenant-1',
    businessUnitId: 'biz-1',
    action: 'create_database',
    payload: {
      businessId: 'biz-1',
      engine: 'postgresql',
      extensions: ['pgvector'],
      maxConnections: 10,
      maxSizeMb: 512,
    },
    approvedByPlanId: 'plan-1',
    requestedByAgentId: 'agent-1',
    ...overrides,
  }
}

describe('MechanicRequestValidator', () => {
  it('accepts valid create_database request', () => {
    const validator = new MechanicRequestValidator()

    const result = validator.validate(makeRequest())

    expect(result.valid).toBe(true)
  })

  it('rejects missing core fields', () => {
    const validator = new MechanicRequestValidator()

    const result = validator.validate(makeRequest({ requestId: '' }))

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toContain('Invalid mechanic request')
  })

  it('rejects unsupported payload schema action', () => {
    const validator = new MechanicRequestValidator()

    const result = validator.validate(makeRequest({ action: 'unknown_action' as MechanicRequest['action'] }))

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toContain('Unsupported action payload schema')
  })

  it('rejects invalid payload for action', () => {
    const validator = new MechanicRequestValidator()

    const result = validator.validate(
      makeRequest({
        action: 'create_repo',
        payload: { businessId: 'biz-1', repoName: 'repo', isPrivate: false },
      })
    )

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toContain('Invalid payload for action create_repo')
  })

  it('rejects unsafe command-like content', () => {
    const validator = new MechanicRequestValidator()

    const result = validator.validate(
      makeRequest({
        action: 'create_repo',
        payload: { businessId: 'biz-1', repoName: 'repo; rm -rf /', isPrivate: true },
      })
    )

    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toBe('Unsafe content in payload')
  })

  it('accepts start_container with existing containerId payload', () => {
    const validator = new MechanicRequestValidator()

    const result = validator.validate(
      makeRequest({
        action: 'start_container',
        payload: { containerId: 'container-1' },
      })
    )

    expect(result.valid).toBe(true)
  })

  it('accepts start_container with create payload', () => {
    const validator = new MechanicRequestValidator()

    const result = validator.validate(
      makeRequest({
        action: 'start_container',
        payload: {
          businessId: 'biz-1',
          image: 'node:20-alpine',
          envVars: { NODE_ENV: 'production' },
          resourceLimits: { cpuShares: 256, memoryMb: 256, diskMb: 512 },
          networkPolicy: 'restricted',
        },
      })
    )

    expect(result.valid).toBe(true)
  })

  it('rejects stop_container without containerId', () => {
    const validator = new MechanicRequestValidator()

    const result = validator.validate(
      makeRequest({
        action: 'stop_container',
        payload: {},
      })
    )

    expect(result.valid).toBe(false)
  })
})
