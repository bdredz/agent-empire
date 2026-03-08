import { pgTable, timestamp, jsonb, varchar, numeric } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const analyticsEventTable = pgTable('analytics_events', {
    id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => nanoid()),
    businessId: varchar('business_id', { length: 128 }).notNull(),
    eventName: varchar('event_name', { length: 128 }).notNull(),
    properties: jsonb('properties').default({}),
    numericValue: numeric('numeric_value'),
    userId: varchar('user_id', { length: 128 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
})
