import { describe, expect, it, vi } from 'vitest'
import type { CapabilityManifest } from '@shared/types'
import { CapabilityManifestWriter } from './CapabilityManifestWriter'

function makeManifest(overrides: Partial<CapabilityManifest> = {}): CapabilityManifest {
  return {
    manifestId: 'manifest-1',
    tenantId: 'tenant-1',
    businessUnitId: 'biz-1',
    serviceName: 'ApiGateway',
    version: '1.0.0',
    baseUrl: 'https://api.example.com',
    authScheme: 'api_key',
    supportedOperations: ['invoke'],
    createdAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('CapabilityManifestWriter', () => {
  it('writes manifest as librarian memory proposal', async () => {
    const submitProposal = vi.fn().mockResolvedValue({ accepted: true, entryId: 'entry-1' })
    const writer = new CapabilityManifestWriter({ submitProposal })

    const result = await writer.write(makeManifest())

    expect(result.accepted).toBe(true)
    expect(submitProposal).toHaveBeenCalledOnce()
    const proposal = submitProposal.mock.calls[0]?.[0]
    expect(proposal.kind).toBe('capability_manifest')
    expect(proposal.tenantId).toBe('tenant-1')
  })

  it('forwards rejection from target', async () => {
    const submitProposal = vi.fn().mockResolvedValue({ accepted: false, reason: 'duplicate' })
    const writer = new CapabilityManifestWriter({ submitProposal })

    const result = await writer.write(makeManifest())

    expect(result.accepted).toBe(false)
    expect(result.reason).toBe('duplicate')
  })
})
