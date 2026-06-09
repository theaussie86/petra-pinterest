import { getDashboardStats } from './dashboard-stats'
import type { PinStatus } from '@/types/pins'

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getDashboardStats', () => {
  it('calls the get_dashboard_stats RPC and returns the aggregate', async () => {
    const stats = {
      global: { scheduled: 1, published: 2, pending: 3, overdue: 0 },
      projects: [{ project_id: 'p1', articles: 4, scheduled: 1, published: 2 }],
    }
    mockRpc.mockResolvedValueOnce({ data: stats, error: null })

    const result = await getDashboardStats()

    expect(mockRpc).toHaveBeenCalledWith('get_dashboard_stats')
    expect(result).toEqual(stats)
  })

  it('throws when the RPC errors', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('boom') })
    await expect(getDashboardStats()).rejects.toThrow('boom')
  })
})

// ---------------------------------------------------------------------------
// Executable spec for the get_dashboard_stats SQL (migration 00024).
//
// No live Postgres is available under vitest, so the migration's bucket
// semantics are pinned here by a TS port (`sqlSpec`) and proven to match the
// prior client-side computation (`priorClientComputation`, lifted verbatim from
// the now-retired use-project-stats logic) for equivalent fixtures, including
// tenant isolation. The migration SQL is written to mirror `sqlSpec` exactly.
// ---------------------------------------------------------------------------

interface PinRow {
  tenant_id: string
  blog_project_id: string
  status: PinStatus
  scheduled_at: string | null
}
interface ArticleRow {
  tenant_id: string
  blog_project_id: string
  archived_at: string | null
}

const PUBLISHED_STATUSES: PinStatus[] = ['published']
const PENDING_STATUSES: PinStatus[] = [
  'draft',
  'generate_metadata',
  'generating_metadata',
  'metadata_created',
]

// Mirror of migration 00024 get_dashboard_stats, scoped to a single tenant and
// evaluated at `now`.
function sqlSpec(pinsAll: PinRow[], articlesAll: ArticleRow[], tenantId: string, now: Date) {
  const pins = pinsAll.filter((p) => p.tenant_id === tenantId)
  // SQL counts non-archived articles only (mirrors getAllArticles' archived_at IS NULL).
  const articles = articlesAll.filter((a) => a.tenant_id === tenantId && a.archived_at == null)

  const global = {
    scheduled: pins.filter((p) => p.scheduled_at != null && p.status !== 'published').length,
    published: pins.filter((p) => p.status === 'published').length,
    pending: pins.filter((p) => PENDING_STATUSES.includes(p.status)).length,
    overdue: pins.filter(
      (p) => p.scheduled_at != null && new Date(p.scheduled_at) < now && p.status !== 'published',
    ).length,
  }

  const pids = new Set<string>([
    ...pins.map((p) => p.blog_project_id),
    ...articles.map((a) => a.blog_project_id),
  ])
  const projects = [...pids].map((pid) => ({
    project_id: pid,
    articles: articles.filter((a) => a.blog_project_id === pid).length,
    scheduled: pins.filter(
      (p) => p.blog_project_id === pid && p.scheduled_at != null && p.status !== 'published',
    ).length,
    published: pins.filter((p) => p.blog_project_id === pid && p.status === 'published').length,
  }))

  return { global, projects }
}

// Prior client-side computation, lifted from use-project-stats.ts. Operates over
// rows that the old getAllPins/getAllArticles already scoped to the caller's
// tenant (archived articles excluded by the API), so no tenant filtering here.
function priorClientComputation(pins: PinRow[], articles: ArticleRow[], now: Date) {
  const globalStats = {
    scheduled: pins.filter((p) => p.scheduled_at != null && !PUBLISHED_STATUSES.includes(p.status)).length,
    published: pins.filter((p) => PUBLISHED_STATUSES.includes(p.status)).length,
    pending: pins.filter((p) => PENDING_STATUSES.includes(p.status)).length,
    overdue: pins.filter((p) => p.scheduled_at != null && new Date(p.scheduled_at) < now && !PUBLISHED_STATUSES.includes(p.status)).length,
  }

  const map = new Map<string, { articles: number; scheduled: number; published: number }>()
  for (const article of articles) {
    const entry = map.get(article.blog_project_id) ?? { articles: 0, scheduled: 0, published: 0 }
    entry.articles++
    map.set(article.blog_project_id, entry)
  }
  for (const pin of pins) {
    const entry = map.get(pin.blog_project_id) ?? { articles: 0, scheduled: 0, published: 0 }
    if (pin.scheduled_at != null && !PUBLISHED_STATUSES.includes(pin.status)) entry.scheduled++
    if (PUBLISHED_STATUSES.includes(pin.status)) entry.published++
    map.set(pin.blog_project_id, entry)
  }
  return { globalStats, projectStatsMap: map }
}

describe('get_dashboard_stats SQL spec', () => {
  const NOW = new Date('2026-06-09T12:00:00Z')
  const PAST = '2026-06-01T00:00:00Z'
  const FUTURE = '2026-07-01T00:00:00Z'
  const T1 = 'tenant-1'
  const T2 = 'tenant-2'

  const pins: PinRow[] = [
    { tenant_id: T1, blog_project_id: 'A', status: 'published', scheduled_at: PAST },
    { tenant_id: T1, blog_project_id: 'A', status: 'metadata_created', scheduled_at: FUTURE },
    { tenant_id: T1, blog_project_id: 'A', status: 'draft', scheduled_at: PAST }, // overdue + scheduled + pending
    { tenant_id: T1, blog_project_id: 'B', status: 'generating_metadata', scheduled_at: null }, // pending only
    { tenant_id: T1, blog_project_id: 'B', status: 'published', scheduled_at: null },
    // second tenant rows must never leak into tenant-1 counts
    { tenant_id: T2, blog_project_id: 'Z', status: 'published', scheduled_at: PAST },
    { tenant_id: T2, blog_project_id: 'Z', status: 'draft', scheduled_at: PAST },
  ]
  const articles: ArticleRow[] = [
    { tenant_id: T1, blog_project_id: 'A', archived_at: null },
    { tenant_id: T1, blog_project_id: 'A', archived_at: null },
    { tenant_id: T1, blog_project_id: 'A', archived_at: PAST }, // archived → excluded
    { tenant_id: T1, blog_project_id: 'C', archived_at: null }, // project with no pins
    { tenant_id: T2, blog_project_id: 'Z', archived_at: null },
  ]

  it('computes correct global counts per status bucket for the tenant', () => {
    const { global } = sqlSpec(pins, articles, T1, NOW)
    expect(global).toEqual({ scheduled: 2, published: 2, pending: 3, overdue: 1 })
  })

  it('computes correct per-project counts (incl. a project with only articles)', () => {
    const { projects } = sqlSpec(pins, articles, T1, NOW)
    const byId = Object.fromEntries(projects.map((p) => [p.project_id, p]))
    expect(byId['A']).toEqual({ project_id: 'A', articles: 2, scheduled: 2, published: 1 })
    expect(byId['B']).toEqual({ project_id: 'B', articles: 0, scheduled: 0, published: 1 })
    expect(byId['C']).toEqual({ project_id: 'C', articles: 1, scheduled: 0, published: 0 })
  })

  it('is tenant-isolated: a second tenant rows never appear in the first tenant counts', () => {
    const { projects } = sqlSpec(pins, articles, T1, NOW)
    expect(projects.find((p) => p.project_id === 'Z')).toBeUndefined()

    const t2 = sqlSpec(pins, articles, T2, NOW)
    expect(t2.global).toEqual({ scheduled: 1, published: 1, pending: 1, overdue: 1 })
    expect(t2.projects).toEqual([{ project_id: 'Z', articles: 1, scheduled: 1, published: 1 }])
  })

  it('matches the prior client-side computation for equivalent (tenant-scoped) fixtures', () => {
    // The old client path received rows already scoped to the tenant.
    const tenantPins = pins.filter((p) => p.tenant_id === T1)
    const tenantArticles = articles.filter((a) => a.tenant_id === T1 && a.archived_at == null)

    const spec = sqlSpec(pins, articles, T1, NOW)
    const prior = priorClientComputation(tenantPins, tenantArticles, NOW)

    expect(spec.global).toEqual(prior.globalStats)
    for (const p of spec.projects) {
      expect({ articles: p.articles, scheduled: p.scheduled, published: p.published }).toEqual(
        prior.projectStatsMap.get(p.project_id),
      )
    }
    expect(spec.projects.length).toBe(prior.projectStatsMap.size)
  })
})
