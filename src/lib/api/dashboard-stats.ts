import { supabase } from '@/lib/supabase'

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
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats')
  if (error) throw error
  return data as DashboardStats
}
