import { describe, expect, it } from 'vitest'
import { CounterpartyRegistry } from '../trust/CounterpartyRegistry'
import { QuoteService } from './QuoteService'

function buildNow(iso: string): () => Date {
  return () => new Date(iso)
}

async function addCounterparty(
  registry: CounterpartyRegistry,
  tenantId = 'tenant-1',
  trustStatus: 'trusted' | 'watch' | 'blocked' | 'unknown' = 'trusted',
) {
  return registry.add(tenantId, {
    displayName: 'Vendor A',
    counterpartyType: 'merchant',
    trustStatus,
    tags: ['vendor'],
  })
}

describe('QuoteService', () => {
  it('creates quote with id and default expiry', async () => {
    const counterpartyRegistry = new CounterpartyRegistry()
    const counterparty = await addCounterparty(counterpartyRegistry)
    const service = new QuoteService(counterpartyRegistry, {
      now: buildNow('2026-03-10T12:00:00.000Z'),
    })

    const quote = await service.create({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Design', amount: 50, currency: 'USD', quantity: 2 }],
      totalAmount: 100,
      currency: 'USD',
    })

    expect((quote.quoteId as string).startsWith('quote_')).toBe(true)
    expect(quote.createdAt).toBe('2026-03-10T12:00:00.000Z')
    expect(quote.expiresAt).toBe('2026-03-10T12:15:00.000Z')
  })

  it('validates line items must be present', async () => {
    const counterpartyRegistry = new CounterpartyRegistry()
    const counterparty = await addCounterparty(counterpartyRegistry)
    const service = new QuoteService(counterpartyRegistry)

    await expect(
      service.create({
        tenantId: 'tenant-1',
        counterpartyId: counterparty.counterpartyId,
        lineItems: [],
        totalAmount: 10,
        currency: 'USD',
      }),
    ).rejects.toThrow('Quote must contain at least one line item')
  })

  it('rejects negative line item amount', async () => {
    const counterpartyRegistry = new CounterpartyRegistry()
    const counterparty = await addCounterparty(counterpartyRegistry)
    const service = new QuoteService(counterpartyRegistry)

    await expect(
      service.create({
        tenantId: 'tenant-1',
        counterpartyId: counterparty.counterpartyId,
        lineItems: [{ description: 'Task', amount: -5, currency: 'USD', quantity: 1 }],
        totalAmount: -5,
        currency: 'USD',
      }),
    ).rejects.toThrow('Line item amount must be positive')
  })

  it('rejects blocked counterparties', async () => {
    const counterpartyRegistry = new CounterpartyRegistry()
    const counterparty = await addCounterparty(
      counterpartyRegistry,
      'tenant-1',
      'blocked',
    )
    const service = new QuoteService(counterpartyRegistry)

    await expect(
      service.create({
        tenantId: 'tenant-1',
        counterpartyId: counterparty.counterpartyId,
        lineItems: [{ description: 'Task', amount: 20, currency: 'USD', quantity: 1 }],
        totalAmount: 20,
        currency: 'USD',
      }),
    ).rejects.toThrow('Counterparty is blocked')
  })

  it('stores and retrieves quote by tenant and id', async () => {
    const counterpartyRegistry = new CounterpartyRegistry()
    const counterparty = await addCounterparty(counterpartyRegistry)
    const service = new QuoteService(counterpartyRegistry)

    const created = await service.create({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 20, currency: 'USD', quantity: 1 }],
      totalAmount: 20,
      currency: 'USD',
    })

    const loaded = await service.get('tenant-1', created.quoteId)
    expect(loaded).toEqual(created)
  })

  it('rejects retrieval of expired quote', async () => {
    const counterpartyRegistry = new CounterpartyRegistry()
    const counterparty = await addCounterparty(counterpartyRegistry)
    let nowIso = '2026-03-10T12:00:00.000Z'
    const service = new QuoteService(counterpartyRegistry, { now: () => new Date(nowIso) })

    const expiring = await service.create({
      tenantId: 'tenant-1',
      counterpartyId: counterparty.counterpartyId,
      lineItems: [{ description: 'Task', amount: 25, currency: 'USD', quantity: 1 }],
      totalAmount: 25,
      currency: 'USD',
      expiresAt: '2026-03-10T12:00:01.000Z',
    })

    nowIso = '2026-03-10T12:01:00.000Z'
    await expect(service.get('tenant-1', expiring.quoteId)).rejects.toThrow('Quote has expired')
  })

  it('lists only non-expired quotes for a tenant', async () => {
    const counterpartyRegistry = new CounterpartyRegistry()
    const counterpartyOne = await addCounterparty(counterpartyRegistry, 'tenant-1')
    const counterpartyTwo = await addCounterparty(counterpartyRegistry, 'tenant-2')
    const service = new QuoteService(counterpartyRegistry, {
      now: buildNow('2026-03-10T12:00:00.000Z'),
    })

    await service.create({
      tenantId: 'tenant-1',
      counterpartyId: counterpartyOne.counterpartyId,
      lineItems: [{ description: 'Task', amount: 20, currency: 'USD', quantity: 1 }],
      totalAmount: 20,
      currency: 'USD',
      expiresAt: '2026-03-10T12:10:00.000Z',
    })

    await service.create({
      tenantId: 'tenant-2',
      counterpartyId: counterpartyTwo.counterpartyId,
      lineItems: [{ description: 'Task', amount: 30, currency: 'USD', quantity: 1 }],
      totalAmount: 30,
      currency: 'USD',
      expiresAt: '2026-03-10T12:10:00.000Z',
    })

    const quoteIds = (await service.listByTenant('tenant-1')).map((quote) => quote.quoteId)
    expect(quoteIds).toHaveLength(1)
  })

  it('rejects quote with mismatched total amount', async () => {
    const counterpartyRegistry = new CounterpartyRegistry()
    const counterparty = await addCounterparty(counterpartyRegistry)
    const service = new QuoteService(counterpartyRegistry)

    await expect(
      service.create({
        tenantId: 'tenant-1',
        counterpartyId: counterparty.counterpartyId,
        lineItems: [{ description: 'Task', amount: 20, currency: 'USD', quantity: 2 }],
        totalAmount: 30,
        currency: 'USD',
      }),
    ).rejects.toThrow('Total amount does not match line items')
  })
})
