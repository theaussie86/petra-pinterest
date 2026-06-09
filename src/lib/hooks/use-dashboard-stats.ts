import { useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { dashboardStatsQueryOptions } from '@/lib/query/dashboard-stats'

/**
 * Dashboard stats from the single `get_dashboard_stats` aggregate RPC, consumed
 * via suspense. Replaces the previous useAllPins + useAllArticles fan-out that
 * pulled every pin and article to the client purely to count them (PRD #46,
 * issue #51). The route loader prefetches `dashboardStatsQueryOptions`, so the
 * data is present on first render; background refetches show stale data without
 * a fallback flash.
 *
 * Returns the same shape the dashboard previously consumed from
 * `useProjectStats`: a global counts object plus a per-project lookup map.
 */
export function useDashboardStatsSuspense() {
  const { data } = useSuspenseQuery(dashboardStatsQueryOptions())

  const projectStatsMap = useMemo(() => {
    const map = new Map<string, { articles: number; scheduled: number; published: number }>()
    for (const p of data.projects) {
      map.set(p.project_id, {
        articles: p.articles,
        scheduled: p.scheduled,
        published: p.published,
      })
    }
    return map
  }, [data.projects])

  return { globalStats: data.global, projectStatsMap }
}
