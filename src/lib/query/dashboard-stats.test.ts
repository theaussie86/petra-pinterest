import { dashboardStatsQueryOptions, DASHBOARD_STATS_QUERY_KEY } from './dashboard-stats'

const { mockGetDashboardStats } = vi.hoisted(() => ({
  mockGetDashboardStats: vi.fn(),
}))

vi.mock('@/lib/api/dashboard-stats', () => ({
  getDashboardStats: (...args: any[]) => mockGetDashboardStats(...args),
}))

describe('dashboardStatsQueryOptions', () => {
  it('uses the stable ["dashboard-stats"] query key so loader and hook share one cache entry', () => {
    expect(dashboardStatsQueryOptions().queryKey).toEqual(DASHBOARD_STATS_QUERY_KEY)
    expect(DASHBOARD_STATS_QUERY_KEY).toEqual(['dashboard-stats'])
  })

  it('sets the project default 30s staleTime', () => {
    expect(dashboardStatsQueryOptions().staleTime).toBe(30 * 1000)
  })

  it('resolves the stats via the getDashboardStats api function', async () => {
    const stats = { global: { scheduled: 0, published: 0, pending: 0, overdue: 0 }, projects: [] }
    mockGetDashboardStats.mockResolvedValueOnce(stats)

    const result = await dashboardStatsQueryOptions().queryFn!({} as any)

    expect(mockGetDashboardStats).toHaveBeenCalledTimes(1)
    expect(result).toEqual(stats)
  })
})
