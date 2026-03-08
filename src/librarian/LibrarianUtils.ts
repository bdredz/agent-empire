import type { ArtifactId, KnowledgeEntry } from '@shared/types'
import type { ILibrarianStore } from './Librarian'

export async function findDuplicate(
  store: ILibrarianStore,
  dedupThreshold: number,
  entry: KnowledgeEntry,
): Promise<ArtifactId | undefined> {
  const textMatches = await store.searchByText(entry.content, { businessId: entry.businessId, limit: 5 })
  const exact = textMatches.find((candidate) => candidate.content.trim() === entry.content.trim())
  if (exact) {
    return exact.id
  }

  if (!entry.embedding || entry.embedding.length === 0) {
    return undefined
  }

  const vectorMatches = await store.searchByVector(entry.embedding, { businessId: entry.businessId, limit: 1 })
  const top = vectorMatches[0]
  if (top && top.similarity >= dedupThreshold) {
    return top.entry.id
  }
  return undefined
}

export function applyDefaultExpiry(entry: KnowledgeEntry, defaultTtlSec: number): KnowledgeEntry {
  if (entry.expiresAt) {
    return entry
  }

  const expiresAt = new Date(Date.now() + defaultTtlSec * 1000).toISOString()
  return { ...entry, expiresAt }
}

export function readEnvNumber(key: string, fallback: number, min: number, max?: number): number {
  const raw = process.env[key]
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback
  }
  if (max !== undefined && parsed > max) {
    return fallback
  }
  return parsed
}

export function readEnvCsv(key: string, fallback: string[]): string[] {
  const raw = process.env[key]
  if (!raw) {
    return fallback
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  return values.length > 0 ? values : fallback
}
