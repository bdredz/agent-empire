import { nanoid } from 'nanoid'
import { integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const apiGatewayRequestTable = pgTable('api_gateway_requests', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => nanoid()),
  businessId: varchar('business_id', { length: 128 }).notNull(),
  targetUrl: text('target_url').notNull(),
  method: varchar('method', { length: 16 }).notNull(),
  responseStatus: integer('response_status').notNull(),
  responseBody: text('response_body'),
  responseHeaders: jsonb('response_headers').$type<Record<string, string>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
