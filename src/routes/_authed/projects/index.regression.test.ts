import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Regression guard for issue #69: the projects overview must aggregate stats
// through the server-side `get_dashboard_stats` RPC (via
// `useDashboardStatsSuspense`), not the client-side `useProjectStats` →
// `useAllPins` → `getAllPins` path. The latter ran `.select('*')` without
// pagination and hit PostgREST's silent 1000-row cap, dropping the
// latest-scheduled (future) pins and showing "0 geplant" for tenants with
// >1000 pins. Both feeds now flow from the same row-cap-free aggregate.

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '../../..')
const read = (rel: string) => readFileSync(resolve(srcRoot, rel), 'utf8')

describe('projects overview stats wiring (issue #69)', () => {
  const indexRoute = read('routes/_authed/projects/index.tsx')

  it('consumes the server-aggregated dashboard stats RPC', () => {
    expect(indexRoute).toContain('useDashboardStatsSuspense')
    expect(indexRoute).toContain('dashboardStatsQueryOptions')
  })

  it('no longer uses the row-capped client-side stats path', () => {
    expect(indexRoute).not.toContain('useProjectStats')
    expect(indexRoute).not.toContain('useAllPins')
  })

  it('prefetches the dashboard stats aggregate in its loader', () => {
    expect(indexRoute).toMatch(/ensureQueryData\(\s*dashboardStatsQueryOptions\(\)\s*\)/)
  })

  it('removes the orphaned row-capped helpers from the codebase', () => {
    expect(read('lib/hooks/use-pins.ts')).not.toContain('export function useAllPins')
    expect(read('lib/api/pins.ts')).not.toContain('export async function getAllPins')
  })
})
