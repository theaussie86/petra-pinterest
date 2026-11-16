import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Pulled in transitively via createBoardLister; stub so no real env is needed.
vi.mock('@/lib/server/supabase', () => ({ getSupabaseServiceClient: () => ({}) }))
vi.mock('@/lib/server/publish-sync', () => ({ reconcilePublishJobs: vi.fn() }))

import { createSupabaseAuthenticate } from './server-auth'
import { createTenantContextCache } from './tenant-context-cache'
import type { SupabaseClient } from '@supabase/supabase-js'

interface TableResponse {
  data: unknown
  error: { code?: string; message: string } | null
}

interface FakeOptions {
  claims?: Record<string, unknown> | null
  profiles?: TableResponse
  tenant_features?: TableResponse
  tenant_settings?: TableResponse
}

const DEFAULTS: Required<Omit<FakeOptions, 'claims'>> = {
  profiles: { data: { tenant_id: 'tenant-1', display_name: 'Petra' }, error: null },
  tenant_features: { data: [{ feature: 'pin_werkstatt' }], error: null },
  tenant_settings: { data: { ai_metadata_enabled: true }, error: null },
}

/** Counts `.from(table)` calls so a test can assert how many DB reads happened. */
function makeCountingFactory(opts: FakeOptions = {}) {
  const counts: Record<string, number> = {}
  const { claims: _claims, ...tableOverrides } = opts
  const responses: Record<string, TableResponse> = { ...DEFAULTS, ...tableOverrides }

  const factory = (token: string): SupabaseClient => {
    const client = {
      auth: {
        getClaims: async () =>
          token === 'valid'
            ? { data: { claims: opts.claims ?? { sub: 'user-1', email: 'petra@example.com' } }, error: null }
            : { data: null, error: { message: 'bad token' } },
      },
      from(table: string) {
        counts[table] = (counts[table] ?? 0) + 1
        const result = responses[table]
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          single: async () => result,
          maybeSingle: async () => result,
          then: (resolve: (v: TableResponse) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject),
        }
        return builder
      },
    }
    return client as unknown as SupabaseClient
  }

  return { factory, counts }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('createSupabaseAuthenticate — tenant context cache', () => {
  it('reads profiles/tenant_features/tenant_settings only once for two calls within the TTL', async () => {
    const { factory, counts } = makeCountingFactory()
    const cache = createTenantContextCache({ ttlMs: 60_000, now: () => 1_000 })
    const authenticate = createSupabaseAuthenticate({ cache, createSupabaseClient: factory })

    const first = await authenticate('valid')
    const second = await authenticate('valid')

    expect(first?.tenantId).toBe('tenant-1')
    expect(second?.tenantId).toBe('tenant-1')
    expect(counts.profiles).toBe(1)
    expect(counts.tenant_features).toBe(1)
    expect(counts.tenant_settings).toBe(1)
  })

  it('re-reads after the TTL expires', async () => {
    let clock = 1_000
    const { factory, counts } = makeCountingFactory()
    const cache = createTenantContextCache({ ttlMs: 60_000, now: () => clock })
    const authenticate = createSupabaseAuthenticate({ cache, createSupabaseClient: factory })

    await authenticate('valid')
    clock += 60_001
    await authenticate('valid')

    expect(counts.profiles).toBe(2)
  })

  it('does not cache when the settings read fails', async () => {
    const { factory, counts } = makeCountingFactory({
      tenant_settings: { data: null, error: { code: 'XX000', message: 'boom' } },
    })
    const cache = createTenantContextCache({ now: () => 1_000 })
    const authenticate = createSupabaseAuthenticate({ cache, createSupabaseClient: factory })

    const first = await authenticate('valid')
    await authenticate('valid')

    // Fallback "AI on" still applies for the call, but nothing is cached.
    expect(first?.aiMetadataEnabled).toBe(true)
    expect(counts.profiles).toBe(2)
    expect(cache.size).toBe(0)
  })

  it('does not cache when the profile is missing', async () => {
    const { factory, counts } = makeCountingFactory({
      profiles: { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    })
    const cache = createTenantContextCache({ now: () => 1_000 })
    const authenticate = createSupabaseAuthenticate({ cache, createSupabaseClient: factory })

    await authenticate('valid')
    await authenticate('valid')

    expect(counts.profiles).toBe(2)
    expect(cache.size).toBe(0)
  })

  it('keeps different users in separate cache entries', async () => {
    const factoryA = makeCountingFactory({ claims: { sub: 'user-a', email: 'a@x.de' } })
    const factoryB = makeCountingFactory({
      claims: { sub: 'user-b', email: 'b@x.de' },
      profiles: { data: { tenant_id: 'tenant-b', display_name: 'B' }, error: null },
    })
    const cache = createTenantContextCache({ now: () => 1_000 })

    const authA = createSupabaseAuthenticate({ cache, createSupabaseClient: factoryA.factory })
    const authB = createSupabaseAuthenticate({ cache, createSupabaseClient: factoryB.factory })

    const a = await authA('valid')
    const b = await authB('valid')

    expect(a?.tenantId).toBe('tenant-1')
    expect(b?.tenantId).toBe('tenant-b')
    expect(cache.size).toBe(2)
  })

  it('rejects an invalid token even when the sub is cached', async () => {
    const { factory } = makeCountingFactory()
    const cache = createTenantContextCache({ now: () => 1_000 })
    const authenticate = createSupabaseAuthenticate({ cache, createSupabaseClient: factory })

    await authenticate('valid') // caches user-1
    const result = await authenticate('nope')

    expect(result).toBeNull()
  })
})
