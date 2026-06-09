import { queryOptions } from '@tanstack/react-query'
import { getDashboardStats, type DashboardStats } from '@/lib/api/dashboard-stats'

/**
 * The single cache key for the dashboard stats aggregate. Shared by the
 * dashboard route loader (prefetch via `ensureQueryData`) and the consuming
 * suspense hook so loader-prefetched data and the hook always hit the same
 * cache entry.
 */
export const DASHBOARD_STATS_QUERY_KEY = ['dashboard-stats'] as const

/**
 * Shared query options for the dashboard stats aggregate — the single source of
 * truth referenced by both the dashboard route loader and the consuming hook
 * (Workstream 2 Query SSR). The route loader awaits
 * `ensureQueryData(dashboardStatsQueryOptions())` so the stats arrive in the SSR
 * HTML and hydrate without a client refetch — and without serializing the full
 * pins/articles tables into the hydration payload.
 */
export function dashboardStatsQueryOptions() {
  return queryOptions<DashboardStats>({
    queryKey: DASHBOARD_STATS_QUERY_KEY,
    queryFn: getDashboardStats,
    staleTime: 30 * 1000,
  })
}
