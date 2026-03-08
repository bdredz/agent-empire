import { nanoid } from 'nanoid'
import { boolean, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const webhookSubscriptionTable = pgTable('webhook_subscriptions', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => nanoid()),
  businessId: varchar('business_id', { length: 128 }).notNull(),
  eventType: varchar('event_type', { length: 128 }).notNull(),
  targetUrl: text('target_url').notNull(),
  signingSecret: text('signing_secret').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
