import { nanoid } from 'nanoid'
import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const LeadStatus = {
  New: 'new',
  Contacted: 'contacted',
  Qualified: 'qualified',
  Won: 'won',
  Lost: 'lost',
} as const
export type LeadStatus = typeof LeadStatus[keyof typeof LeadStatus]

export const leadTable = pgTable('leads', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => nanoid()),
  businessId: varchar('business_id', { length: 128 }).notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  status: varchar('status', { length: 32 }).notNull().default('new'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
