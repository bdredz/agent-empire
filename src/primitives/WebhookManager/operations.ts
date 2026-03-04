import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { webhookSubscriptionTable } from '@primitives/WebhookManager/schema'

interface QueryChain {
  values(payload: Record<string, unknown>): QueryChain
  set(payload: Record<string, unknown>): QueryChain
  from(table: unknown): QueryChain
  where(condition: unknown): QueryChain
  execute(): Promise<Array<Record<string, unknown>>>
  returning(selection: Record<string, unknown>): Promise<Array<Record<string, unknown>>>
}

interface WebhookDb {
  insert(table: unknown): QueryChain
  select(): QueryChain
  update(table: unknown): QueryChain
}

interface WebhookFetchResponse {
  readonly ok: boolean
}

interface WebhookFetcher {
  (url: string, init: RequestInit): Promise<WebhookFetchResponse>
}

export interface DispatchResult {
  readonly delivered: number
  readonly failed: number
}

export class WebhookManagerOps {
  constructor(
    private readonly db: WebhookDb,
    private readonly fetcher: WebhookFetcher,
  ) {}

  public async registerWebhook(
    businessId: string,
    eventType: string,
    targetUrl: string,
    signingSecret: string,
  ): Promise<Record<string, unknown> | undefined> {
    const rows = await this.db
      .insert(webhookSubscriptionTable)
      .values({ businessId, eventType, targetUrl, signingSecret, isActive: true })
      .returning({ id: webhookSubscriptionTable.id })
    return rows[0]
  }

  public async listWebhooks(businessId: string, eventType?: string): Promise<Array<Record<string, unknown>>> {
    if (eventType) {
      return this.db
        .select()
        .from(webhookSubscriptionTable)
        .where(
          and(
            eq(webhookSubscriptionTable.businessId, businessId),
            eq(webhookSubscriptionTable.eventType, eventType),
            eq(webhookSubscriptionTable.isActive, true),
          ),
        )
        .execute()
    }

    return this.db
      .select()
      .from(webhookSubscriptionTable)
      .where(and(eq(webhookSubscriptionTable.businessId, businessId), eq(webhookSubscriptionTable.isActive, true)))
      .execute()
  }

  public async deactivateWebhook(id: string): Promise<boolean> {
    const rows = await this.db
      .update(webhookSubscriptionTable)
      .set({ isActive: false })
      .where(eq(webhookSubscriptionTable.id, id))
      .returning({ id: webhookSubscriptionTable.id })
    return rows.length > 0
  }

  public async dispatchEvent(
    businessId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<DispatchResult> {
    const hooks = await this.listWebhooks(businessId, eventType)
    const encodedPayload = JSON.stringify(payload)

    let delivered = 0
    let failed = 0

    for (const hook of hooks) {
      const targetUrl = hook.targetUrl
      const signingSecret = hook.signingSecret
      if (typeof targetUrl !== 'string' || typeof signingSecret !== 'string') {
        failed += 1
        continue
      }

      const signature = this.signPayload(encodedPayload, signingSecret)
      const response = await this.fetcher(targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-agent-empire-signature': signature,
        },
        body: encodedPayload,
      })

      if (response.ok) {
        delivered += 1
      } else {
        failed += 1
      }
    }

    return { delivered, failed }
  }

  private signPayload(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex')
  }
}
