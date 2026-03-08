/**
 * Shared database abstraction interfaces for primitive operations.
 * Models the Drizzle ORM query builder pattern used across all primitives.
 *
 * Consolidates the QueryChain and PrimitiveDb interfaces that were previously
 * duplicated in LeadTracker, ApiGateway, and WebhookManager operations files.
 */

export interface QueryChain<T = Array<Record<string, unknown>>> {
    values(payload: Record<string, unknown>): QueryChain<T>
    set(payload: Record<string, unknown>): QueryChain<T>
    from(table: unknown): QueryChain<T>
    where(condition: unknown): QueryChain<T>
    execute(): Promise<T>
    returning(selection: Record<string, unknown>): Promise<T>
}

export interface PrimitiveDb {
    insert(table: unknown): QueryChain
    select(): QueryChain
    update(table: unknown): QueryChain
    delete(table: unknown): QueryChain
}
