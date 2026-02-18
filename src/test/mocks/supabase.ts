/**
 * Mock Supabase client factory.
 *
 * Creates a chainable mock that mirrors the Supabase JS client query-builder API.
 * Each method returns `this` for chaining; the chain is thenable so `await` resolves
 * with the configured `{ data, error, count }` response.
 */

import { vi } from 'vitest'

interface QueryResponse {
  data?: unknown
  error?: unknown
  count?: number | null
}

/**
 * Build a single chainable query builder that resolves with `response`.
 * Every filter / modifier method returns `this`; awaiting resolves the response.
 */
export function createMockQueryBuilder(response: QueryResponse = {}) {
  const { data = null, error = null, count = null } = response

  const builder: Record<string, any> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),

    // Thenable — `await builder` resolves the response
    then(
      resolve: (value: { data: unknown; error: unknown; count: number | null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve({ data, error, count }).then(resolve, reject)
    },
  }

  // Make every method return `builder` so chaining works
  for (const key of Object.keys(builder)) {
    if (key !== 'then' && typeof builder[key]?.mockReturnThis === 'function') {
      builder[key].mockReturnValue(builder)
    }
  }

  return builder
}

/**
 * Build a mock storage bucket with `.upload()`, `.remove()`, `.getPublicUrl()`.
 */
export function createMockStorageBucket(opts: { uploadError?: unknown; publicUrl?: string } = {}) {
  return {
    upload: vi.fn().mockResolvedValue({ error: opts.uploadError ?? null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn((path: string) => ({
      data: {
        publicUrl:
          opts.publicUrl ??
          `https://test.supabase.co/storage/v1/object/public/pin-images/${path}`,
      },
    })),
  }
}

/**
 * Create a full mock Supabase client.
 *
 * `from` is a bare `vi.fn()` — configure it per-test with
 * `.mockReturnValue(createMockQueryBuilder({ data }))` or
 * `.mockReturnValueOnce(...)` for sequential calls.
 */
export function createMockSupabaseClient() {
  return {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue(createMockStorageBucket()),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}
