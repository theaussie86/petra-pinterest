import { tabCountsFromStatusCounts, computeTabCounts } from './pin-status-filter-bar'
import { buildPin } from '@/test/factories'

describe('tabCountsFromStatusCounts', () => {
  it('rolls per-status totals up into the tab buckets', () => {
    const counts = tabCountsFromStatusCounts({
      draft: 5,
      generate_metadata: 2,
      generating_metadata: 1,
      metadata_created: 4,
      published: 10,
      error: 3,
    })

    expect(counts.draft).toBe(5)
    // The generation tab groups both the queued (generate_metadata) and in-flight
    // (generating_metadata) statuses → 2 + 1.
    expect(counts.generation).toBe(3)
    expect(counts.metadata_created).toBe(4)
    expect(counts.published).toBe(10)
    expect(counts.error).toBe(3)
  })

  it('sets "all" to the sum of every status, independent of the tab buckets', () => {
    // A status not mapped to any tab (e.g. a future/legacy status) still counts
    // toward the project total shown on "Alle".
    const counts = tabCountsFromStatusCounts({ draft: 2, published: 3, deleted: 1 })
    expect(counts.all).toBe(6)
  })

  it('returns all-zero counts for an empty project', () => {
    expect(tabCountsFromStatusCounts({})).toEqual({
      all: 0, draft: 0, generation: 0, metadata_created: 0, published: 0, error: 0,
    })
  })

  it('reflects the FULL project totals, not just the loaded pins (issue #67)', () => {
    // The paginated list has loaded only 2 of 100 pins...
    const loaded = [buildPin({ status: 'draft' }), buildPin({ status: 'published' })]
    const loadedCounts = computeTabCounts(loaded)
    expect(loadedCounts.all).toBe(2)

    // ...but the status-count query returns the project's real totals.
    const realCounts = tabCountsFromStatusCounts({ draft: 60, published: 40 })
    expect(realCounts.all).toBe(100)
    expect(realCounts.draft).toBe(60)
    expect(realCounts.published).toBe(40)
  })
})
