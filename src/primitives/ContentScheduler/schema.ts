import { pgTable, text, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const ContentScheduleStatus = {
    Pending: 'pending',
    Published: 'published',
    Failed: 'failed',
} as const
export type ContentScheduleStatus = typeof ContentScheduleStatus[keyof typeof ContentScheduleStatus]

export const scheduledContentTable = pgTable('scheduled_content', {
    id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => nanoid()),
    businessId: varchar('business_id', { length: 128 }).notNull(),
    content: text('content').notNull(),
    platforms: jsonb('platforms').notNull().$type<string[]>(),
    scheduledFor: timestamp('scheduled_for').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
})
