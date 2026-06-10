import { getSupabaseClient } from '@/lib/supabase-iso'

/**
 * Global, account-wide pin counts per status bucket. Mirrors the bucket
 * definitions in the `get_dashboard_stats` SQL (migration 00024).
 */
export interface DashboardGlobalStats {
  scheduled: number
  published: number
  pending: number
  overdue: number
}

/** Per-project counts surfaced on each dashboard project card. */
export interface DashboardProjectStats {
  project_id: string
  articles: number
  scheduled: number
  published: number
}

export interface DashboardStats {
  global: DashboardGlobalStats
  projects: DashboardProjectStats[]
}

/**
 * Fetch the dashboard stats aggregate in a single tenant-scoped query via the
 * `get_dashboard_stats` RPC, replacing the previous all-pins + all-articles
 * client fan-out used purely for counting (PRD #46, issue #51).
 *
 * The RPC resolves the tenant via `auth.uid()` internally, so it MUST run
 * through the isomorphic selector (ADR 0003, issue #63): in SSR the cookie-bound
 * server client carries the caller's session and `auth.uid()` resolves to the
 * logged-in user, instead of the unauthenticated browser client returning
 * all-zero counts on first paint.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await getSupabaseClient().rpc('get_dashboard_stats')
  if (error) throw error
  return data as DashboardStats
}
