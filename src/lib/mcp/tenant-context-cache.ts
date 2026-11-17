import type { FeatureKey } from '@/lib/features'

/**
 * Per-user tenant context cached between MCP tool calls to keep the Supabase
 * connection pool quiet (#154). Every MCP request used to read `profiles`,
 * `tenant_features` and `tenant_settings` — three DB round-trips per tool call.
 * These four fields change rarely, so one Vercel instance holds them for a short
 * TTL instead of re-reading them on every call.
 *
 * Only `getClaims` still runs on every request, so an invalid token is always
 * rejected; the per-call RLS client is never cached (ADR-0006).
 */
export interface CachedTenantContext {
  tenantId: string
  displayName: string
  features: FeatureKey[]
  aiMetadataEnabled: boolean
}

/** Result of a loader: the resolved context plus whether it may be cached. */
export interface TenantContextLoad {
  context: CachedTenantContext
  /**
   * Only fully successful reads are cacheable. A missing profile, an empty
   * `tenant_id`, a failed feature read or a failed settings read (whose "AI on"
   * fallback is for this call only) must not stick in the cache.
   */
  cacheable: boolean
}

export interface TenantContextCacheOptions {
  /** Time to keep an entry, in ms. Default 60s — the accepted staleness. */
  ttlMs?: number
  /** Soft cap on stored users. On overflow the oldest/expired entries go. */
  maxEntries?: number
  /** Clock seam for tests. Defaults to `Date.now`. */
  now?: () => number
}

export interface TenantContextCache {
  /**
   * Returns the cached context for `userId` when a live entry exists, otherwise
   * runs `load`, caches it when `cacheable`, and returns it.
   */
  resolve(
    userId: string,
    load: () => Promise<TenantContextLoad>,
  ): Promise<CachedTenantContext>
  /** Current number of stored entries (for tests/diagnostics). */
  readonly size: number
}

interface CacheEntry {
  value: CachedTenantContext
  expiresAt: number
}

/** TTL for a cached tenant context in milliseconds (60s, see #154). */
export const TENANT_CONTEXT_CACHE_TTL_MS = 60_000
/** Soft cap on cached users per instance. */
export const TENANT_CONTEXT_CACHE_MAX_ENTRIES = 500

export function createTenantContextCache(
  options: TenantContextCacheOptions = {},
): TenantContextCache {
  const ttlMs = options.ttlMs ?? TENANT_CONTEXT_CACHE_TTL_MS
  const maxEntries = options.maxEntries ?? TENANT_CONTEXT_CACHE_MAX_ENTRIES
  const now = options.now ?? Date.now
  const entries = new Map<string, CacheEntry>()

  /** Make room before inserting: drop expired first, then oldest by insertion. */
  function evictForInsert() {
    if (entries.size < maxEntries) return
    const current = now()
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) entries.delete(key)
    }
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
  }

  return {
    async resolve(userId, load) {
      const existing = entries.get(userId)
      if (existing && existing.expiresAt > now()) {
        return existing.value
      }
      if (existing) entries.delete(userId)

      const { context, cacheable } = await load()
      if (cacheable) {
        evictForInsert()
        entries.set(userId, { value: context, expiresAt: now() + ttlMs })
      }
      return context
    },
    get size() {
      return entries.size
    },
  }
}
