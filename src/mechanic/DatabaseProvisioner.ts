import { z } from 'zod'
import { createChildLogger } from '@shared/logger'
import {
  DatabaseProvisionRequest,
  DatabaseProvisionResult,
} from '@shared/types'
import { IDatabaseProvisioner } from '@mechanic/IMechanic'

interface DatabaseExecutor {
  execute(statement: string): Promise<void>
}

const databaseRequestSchema = z.object({
  businessId: z.string().min(1),
  engine: z.literal('postgresql'),
  extensions: z.array(z.string()),
  maxConnections: z.number().int().positive(),
  maxSizeMb: z.number().int().positive(),
})
const log = createChildLogger('database-provisioner')

export class DatabaseProvisioner implements IDatabaseProvisioner {
  constructor(private readonly executor: DatabaseExecutor) {}

  public async provisionDatabase(request: DatabaseProvisionRequest): Promise<DatabaseProvisionResult> {
    this.validateRequest(request)
    const databaseName = this.buildDatabaseName(request.businessId as string)

    try {
      await this.executor.execute(`CREATE DATABASE ${databaseName}`)
      for (const extension of request.extensions) {
        await this.executor.execute(`CREATE EXTENSION IF NOT EXISTS ${this.sanitizeIdentifier(extension)}`)
      }

      return {
        connectionString: `secret://database/${databaseName}`,
        databaseName,
        status: 'ready',
      }
    } catch (err) {
      log.error({ err, businessId: request.businessId }, 'Database provisioning failed')
      return {
        connectionString: '',
        databaseName,
        status: 'failed',
      }
    }
  }

  private validateRequest(request: DatabaseProvisionRequest): void {
    const parsed = databaseRequestSchema.safeParse(request)
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      throw new Error(`Invalid database provision request: ${details}`)
    }
  }

  private buildDatabaseName(businessId: string): string {
    const safeId = this.sanitizeIdentifier(businessId)
    return `business_${safeId}`
  }

  private sanitizeIdentifier(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
  }
}
