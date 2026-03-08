import { and, eq } from 'drizzle-orm'
import { LeadStatus, leadTable } from '@primitives/LeadTracker/schema'
import { PrimitiveDb } from '@primitives/db'

export class LeadTrackerOps {
  constructor(private readonly db: PrimitiveDb) { }

  public async createLead(
    businessId: string,
    name: string,
    email: string,
    company?: string,
  ): Promise<Record<string, unknown> | undefined> {
    const rows = await this.db
      .insert(leadTable)
      .values({ businessId, name, email, company, status: LeadStatus.New })
      .returning({ id: leadTable.id, status: leadTable.status })
    return rows[0]
  }

  public async listLeads(businessId: string, status?: LeadStatus): Promise<Array<Record<string, unknown>>> {
    if (status) {
      return this.db
        .select()
        .from(leadTable)
        .where(and(eq(leadTable.businessId, businessId), eq(leadTable.status, status)))
        .execute()
    }
    return this.db.select().from(leadTable).where(eq(leadTable.businessId, businessId)).execute()
  }

  public async updateLeadStatus(id: string, status: LeadStatus): Promise<Record<string, unknown> | undefined> {
    const rows = await this.db
      .update(leadTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(leadTable.id, id))
      .returning({ id: leadTable.id, status: leadTable.status })
    return rows[0]
  }

  public async deleteLead(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(leadTable)
      .where(eq(leadTable.id, id))
      .returning({ id: leadTable.id })
    return rows.length > 0
  }
}
