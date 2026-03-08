import type { CapabilityManifest } from '@shared/types'

export class InternalRegistry {
  private readonly manifestsByKey = new Map<string, CapabilityManifest>()

  public upsert(manifest: CapabilityManifest): void {
    this.manifestsByKey.set(this.key(manifest.tenantId, manifest.manifestId), manifest)
  }

  public listByTenant(tenantId: string): CapabilityManifest[] {
    return Array.from(this.manifestsByKey.values()).filter((manifest) => manifest.tenantId === tenantId)
  }

  public listByBusinessUnit(tenantId: string, businessUnitId: string): CapabilityManifest[] {
    return this.listByTenant(tenantId).filter((manifest) => manifest.businessUnitId === businessUnitId)
  }

  public findByService(tenantId: string, serviceName: string): CapabilityManifest[] {
    const normalized = serviceName.toLowerCase()
    return this.listByTenant(tenantId).filter((manifest) => manifest.serviceName.toLowerCase() === normalized)
  }

  private key(tenantId: string, manifestId: string): string {
    return `${tenantId}:${manifestId}`
  }
}
