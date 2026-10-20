import { getDashboardStats } from '@/lib/api/dashboard-stats'
import { defineTool, jsonResult } from '../tool'

/**
 * `get_dashboard_stats` — the same account-wide and per-project counts the
 * dashboard shows (scheduled, published, pending, overdue; per project articles
 * and pins). One tenant-scoped RPC under the caller's RLS (Spec #115, user
 * story 26).
 */
export const getDashboardStatsTool = defineTool({
  name: 'get_dashboard_stats',
  description:
    'Liefert die Dashboard-Kennzahlen: kontoweite Pin-Zahlen (geplant, veröffentlicht, ausstehend, überfällig) und pro Projekt Artikel-, Geplant- und Veröffentlicht-Zahlen.',
  handler: async ({ ctx }) => {
    const stats = await getDashboardStats(ctx.supabase)
    return jsonResult(stats)
  },
})
