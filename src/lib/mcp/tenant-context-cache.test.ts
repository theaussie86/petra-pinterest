import { describe, expect, it, vi } from 'vitest'
import {
  createTenantContextCache,
  type CachedTenantContext,
  type TenantContextLoad,
} from './tenant-context-cache'

function ctx(overrides: Partial<CachedTenantContext> = {}): CachedTenantContext {
  return {
    tenantId: 'tenant-1',
    displayName: 'Petra',
    features: [],
    aiMetadataEnabled: true,
    ...overrides,
  }
}

function okLoad(context = ctx()): () => Promise<TenantContextLoad> {
  return async () => ({ context, cacheable: true })
}

describe('createTenantContextCache', () => {
  it('serves a cached entry without re-running the loader within the TTL', async () => {
    const cache = createTenantContextCache({ ttlMs: 60_000, now: () => 1_000 })
    const load = vi.fn(okLoad())

    const first = await cache.resolve('user-1', load)
    const second = await cache.resolve('user-1', load)

    expect(first.tenantId).toBe('tenant-1')
    expect(second).toBe(first)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('re-runs the loader after the TTL expires', async () => {
    let clock = 1_000
    const cache = createTenantContextCache({ ttlMs: 60_000, now: () => clock })
    const load = vi.fn(okLoad())

    await cache.resolve('user-1', load)
    clock += 60_001
    await cache.resolve('user-1', load)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not cache a result flagged not cacheable', async () => {
    const cache = createTenantContextCache({ now: () => 1_000 })
    const load = vi.fn(async () => ({ context: ctx(), cacheable: false }))

    await cache.resolve('user-1', load)
    await cache.resolve('user-1', load)

    expect(load).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(0)
  })

  it('keeps entries separate per user', async () => {
    const cache = createTenantContextCache({ now: () => 1_000 })
    const loadA = vi.fn(okLoad(ctx({ tenantId: 'a' })))
    const loadB = vi.fn(okLoad(ctx({ tenantId: 'b' })))

    const a = await cache.resolve('user-a', loadA)
    const b = await cache.resolve('user-b', loadB)

    expect(a.tenantId).toBe('a')
    expect(b.tenantId).toBe('b')
    expect(loadA).toHaveBeenCalledTimes(1)
    expect(loadB).toHaveBeenCalledTimes(1)
  })

  it('caps the number of stored entries', async () => {
    const cache = createTenantContextCache({ maxEntries: 500, now: () => 1_000 })

    for (let i = 0; i < 600; i++) {
      await cache.resolve(`user-${i}`, okLoad())
    }

    expect(cache.size).toBeLessThanOrEqual(500)
  })

  it('evicts expired entries before the oldest live ones on overflow', async () => {
    let clock = 0
    const cache = createTenantContextCache({ ttlMs: 100, maxEntries: 2, now: () => clock })

    await cache.resolve('old', okLoad(ctx({ tenantId: 'old' })))
    clock = 200 // 'old' is now expired
    await cache.resolve('live', okLoad(ctx({ tenantId: 'live' })))
    await cache.resolve('new', okLoad(ctx({ tenantId: 'new' })))

    expect(cache.size).toBeLessThanOrEqual(2)
    // 'live' survives because 'old' was expired and dropped first.
    const live = vi.fn(okLoad(ctx({ tenantId: 'live' })))
    await cache.resolve('live', live)
    expect(live).not.toHaveBeenCalled()
  })
})
