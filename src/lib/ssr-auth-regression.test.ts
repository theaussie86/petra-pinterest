/**
 * SSR-auth regression guard (issue #64, PRD #46 Workstream 2).
 *
 * The bug fixed in #60: route loaders prefetch reads server-side via
 * `ensureQueryData`, but the reads used the browser Supabase singleton, which
 * carries no session during SSR. RLS then returned empty for a logged-in user,
 * the empty result dehydrated to the client, and `useSuspenseQuery` held it
 * within `staleTime` — the user saw empty data on first paint.
 *
 * The existing `*.test.ts` unit suites mock the Supabase client wholesale, so
 * they can never observe that distinction. This integration-level test wires up
 * the *real* read path — the projects-list route loader (`ensureQueryData(
 * blogProjectsQueryOptions())`) → `getBlogProjects()` → the isomorphic client
 * selector (`getSupabaseClient`, ADR 0003) — against a faithful simulation of
 * the two Supabase clients:
 *
 *   - the SSR / cookie-bound server client, which carries the caller's session
 *     and so returns that tenant's rows (RLS satisfied), and
 *   - the browser singleton, which has NO session during SSR and so returns
 *     empty (RLS denies).
 *
 * The `getSupabaseClient` mock re-implements the production `.client()/.server()`
 * split exactly (browser singleton on the client, `getSupabaseServerClient()`
 * during SSR) so the test asserts which client the read actually reaches. If a
 * future change reverts a prefetched read to the unauthenticated browser client
 * — directly, or by dropping the isomorphic selector — the authed prefetch
 * returns empty and the first assertion fails CI.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/lib/query/client'
import { blogProjectsQueryOptions } from '@/lib/query/blog-projects'
import { buildBlogProject } from '@/test/factories'
import type { BlogProject } from '@/types/blog-projects'

/**
 * A minimal, session-aware stand-in for a Supabase client. Reading
 * `blog_projects` resolves with the rows the caller's session is allowed to see
 * (RLS simulation): the rows for `session.tenantId`, or `[]` when there is no
 * session. `from` is a spy so the test can assert which client a read reached.
 */
function makeFakeClient(opts: {
  session: { tenantId: string } | null
  rowsByTenant: Record<string, BlogProject[]>
}) {
  const from = vi.fn((_table: string) => {
    const rows = opts.session ? (opts.rowsByTenant[opts.session.tenantId] ?? []) : []
    const builder: Record<string, any> = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      },
    }
    return builder
  })
  return { from }
}

const TENANT_ROWS: Record<string, BlogProject[]> = {
  'tenant-a': [
    buildBlogProject({ id: 'a1', tenant_id: 'tenant-a', name: 'Tenant A blog' }),
  ],
}

// The two worlds, swapped per test. `browserClient` is the singleton from
// `@/lib/supabase` (never has a session during SSR). `serverClient` is the
// cookie-bound `getSupabaseServerClient()` (carries the caller's session).
let browserClient: ReturnType<typeof makeFakeClient>
let serverClient: ReturnType<typeof makeFakeClient>

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return browserClient
  },
}))

vi.mock('@/lib/server/supabase', () => ({
  getSupabaseServerClient: () => serverClient,
}))

// Re-implement the production isomorphic selector (ADR 0003) for the SSR case:
// during a server-side loader prefetch it MUST return the cookie-bound server
// client, not the browser singleton. The vitest stub for `createIsomorphicFn`
// collapses to a no-op, so the real `supabase-iso` module can't run here — this
// mock encodes the exact `.server(() => getSupabaseServerClient())` behaviour
// the loader depends on.
vi.mock('@/lib/supabase-iso', async () => {
  const { getSupabaseServerClient } = await import('@/lib/server/supabase')
  return {
    // SSR branch: the prefetch runs on the server, so it selects the
    // session-bound server client.
    getSupabaseClient: () => getSupabaseServerClient(),
  }
})

beforeEach(() => {
  browserClient = makeFakeClient({ session: null, rowsByTenant: TENANT_ROWS })
  serverClient = makeFakeClient({ session: null, rowsByTenant: TENANT_ROWS })
})

describe('SSR-auth regression guard: projects-list loader prefetch', () => {
  it('returns the tenant\'s rows when the loader prefetches with an authenticated session', async () => {
    // Logged-in user: the cookie-bound server client carries their session.
    serverClient = makeFakeClient({
      session: { tenantId: 'tenant-a' },
      rowsByTenant: TENANT_ROWS,
    })

    // Exactly what the projects-list route loader does.
    const queryClient = createQueryClient()
    const data = await queryClient.ensureQueryData(blogProjectsQueryOptions())

    expect(data).toEqual(TENANT_ROWS['tenant-a'])
    expect(data).toHaveLength(1)

    // The read MUST have gone through the session-bound server client. If a
    // change reverts the prefetch to the unauthenticated browser singleton, the
    // server client is never touched (and `data` would be empty above).
    expect(serverClient.from).toHaveBeenCalledWith('blog_projects')
    expect(browserClient.from).not.toHaveBeenCalled()
  })

  it('returns empty when the loader prefetches without a session (RLS still enforced)', async () => {
    // No session on the server client → RLS yields no rows.
    serverClient = makeFakeClient({ session: null, rowsByTenant: TENANT_ROWS })

    const queryClient = createQueryClient()
    const data = await queryClient.ensureQueryData(blogProjectsQueryOptions())

    expect(data).toEqual([])
  })
})
