import { CapabilityManifest } from '@shared/types'
import { nanoid } from 'nanoid'

export interface ApiGatewayManifestOptions {
    readonly tenantId: string
    readonly businessUnitId: string
    readonly baseUrl: string
    readonly version?: string
}

export function createApiGatewayManifest(options: ApiGatewayManifestOptions): CapabilityManifest {
    return {
        manifestId: `manifest_apigateway_${nanoid()}`,
        tenantId: options.tenantId,
        businessUnitId: options.businessUnitId,
        serviceName: 'ApiGateway',
        version: options.version || '1.0.0',
        baseUrl: options.baseUrl,
        authScheme: 'api_key',
        supportedOperations: [
            'register_endpoint',
            'invoke_endpoint',
            'list_endpoints',
            'revoke_endpoint'
        ],
        healthcheckUrl: `${options.baseUrl}/health`,
        createdAt: new Date().toISOString()
    }
}
