import { queryOptions } from '@tanstack/react-query'
import { fetchUser, type AuthUser } from '@/lib/server/auth'

/**
 * The single cache key for the authed user. Shared by the root loader
 * (prefetch via `ensureQueryData`) and any consumer reading the user, so
 * loader and consumers always hit the same cache entry.
 */
export const USER_QUERY_KEY = ['user'] as const

/**
 * Shared query options for the authenticated user — the single source of
 * truth for resolving the session.
 *
 * The root `beforeLoad` resolves the user through `ensureQueryData` against
 * these options; within the `staleTime` window subsequent client navigations
 * reuse the cached value with zero server calls (the auth round-trip that used
 * to run on every navigation). Skipping per-nav re-verification is safe: every
 * data request is still enforced server-side by RLS + the session JWT, and an
 * expired session is caught by the global auth-error handler.
 */
export function userQueryOptions() {
  return queryOptions<AuthUser | null>({
    queryKey: USER_QUERY_KEY,
    queryFn: () => fetchUser(),
    staleTime: 5 * 60 * 1000,
  })
}
