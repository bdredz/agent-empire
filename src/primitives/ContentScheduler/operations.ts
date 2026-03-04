import { eq, and } from 'drizzle-orm'
import { scheduledContentTable, ContentScheduleStatus } from './schema'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export class ContentSchedulerOps {
    constructor(private readonly db: PostgresJsDatabase) { }

    async queueContent(
        businessId: string,
        content: string,
        platforms: string[],
        scheduledFor: Date
    ) {
        const result = await this.db.insert(scheduledContentTable).values({
            businessId,
            content,
            platforms,
            scheduledFor,
        }).returning({ id: scheduledContentTable.id, status: scheduledContentTable.status })
        return result[0]
    }

    async listScheduledContent(businessId: string, status?: typeof ContentScheduleStatus[keyof typeof ContentScheduleStatus]) {
        if (status) {
            return this.db.select().from(scheduledContentTable)
                .where(and(eq(scheduledContentTable.businessId, businessId), eq(scheduledContentTable.status, status)))
        }
        return this.db.select().from(scheduledContentTable)
            .where(eq(scheduledContentTable.businessId, businessId))
    }

    async cancelScheduledContent(id: string) {
        const result = await this.db.delete(scheduledContentTable)
            .where(eq(scheduledContentTable.id, id))
            .returning({ id: scheduledContentTable.id })
        return result.length > 0
    }

    async updateStatus(id: string, status: typeof ContentScheduleStatus[keyof typeof ContentScheduleStatus]) {
        const result = await this.db.update(scheduledContentTable)
            .set({ status })
            .where(eq(scheduledContentTable.id, id))
            .returning({ id: scheduledContentTable.id, status: scheduledContentTable.status })
        return result[0]
    }
}
