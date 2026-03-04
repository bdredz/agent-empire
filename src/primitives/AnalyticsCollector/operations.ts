import { eq, and, desc } from 'drizzle-orm'
import { analyticsEventTable } from './schema'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export class AnalyticsCollectorOps {
    constructor(private readonly db: PostgresJsDatabase) { }

    async trackEvent(params: {
        businessId: string
        eventName: string
        properties?: Record<string, unknown>
        numericValue?: number
        userId?: string
    }) {
        const result = await this.db.insert(analyticsEventTable).values({
            businessId: params.businessId,
            eventName: params.eventName,
            properties: params.properties || {},
            numericValue: params.numericValue !== undefined ? params.numericValue.toString() : null,
            userId: params.userId,
        }).returning({ id: analyticsEventTable.id })
        return result[0]
    }

    async queryEvents(businessId: string, eventName?: string, limit: number = 50) {
        const filters = [eq(analyticsEventTable.businessId, businessId)]
        if (eventName) {
            filters.push(eq(analyticsEventTable.eventName, eventName))
        }

        return this.db.select().from(analyticsEventTable)
            .where(and(...filters))
            .orderBy(desc(analyticsEventTable.createdAt))
            .limit(limit)
    }

    async clearEvents(businessId: string) {
        const result = await this.db.delete(analyticsEventTable)
            .where(eq(analyticsEventTable.businessId, businessId))
            .returning({ id: analyticsEventTable.id })
        return result.length
    }
}
