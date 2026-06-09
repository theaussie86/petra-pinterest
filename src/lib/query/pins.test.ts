import { pinsPaginatedQueryOptions, pinsPaginatedQueryKey } from './pins'

const { mockGetPinsPaginated } = vi.hoisted(() => ({
  mockGetPinsPaginated: vi.fn(),
}))

vi.mock('@/lib/api/pins', () => ({
  getPinsPaginated: (...args: any[]) => mockGetPinsPaginated(...args),
}))

describe('pinsPaginatedQueryOptions', () => {
  it('uses a stable ["pins", projectId, "paginated", statusFilter] key', () => {
    expect(pinsPaginatedQueryOptions('proj1').queryKey).toEqual([
      'pins',
      'proj1',
      'paginated',
      undefined,
    ])
    expect(pinsPaginatedQueryKey('proj1', undefined)).toEqual([
      'pins',
      'proj1',
      'paginated',
      undefined,
    ])
  })

  it('reflects the status filter in the key so each filter has its own cache entry', () => {
    expect(pinsPaginatedQueryOptions('proj1', { statusFilter: ['draft'] }).queryKey).toEqual([
      'pins',
      'proj1',
      'paginated',
      ['draft'],
    ])
    expect(
      pinsPaginatedQueryOptions('proj1', { statusFilter: ['draft'] }).queryKey,
    ).not.toEqual(pinsPaginatedQueryOptions('proj1', { statusFilter: ['published'] }).queryKey)
  })

  it('reflects the project id in the key so loader and hook share one entry per project', () => {
    expect(pinsPaginatedQueryOptions('proj1').queryKey).not.toEqual(
      pinsPaginatedQueryOptions('proj2').queryKey,
    )
  })

  it('nests under the ["pins"] key so pin mutations/realtime invalidation also refresh it', () => {
    // ['pins'] and ['pins', projectId] are prefixes of the paginated key, so
    // existing invalidateQueries on those keys match the paginated query too.
    expect(pinsPaginatedQueryOptions('proj1').queryKey.slice(0, 2)).toEqual(['pins', 'proj1'])
  })

  it('starts pagination from a recent-days window and pages by created_at cursor', () => {
    const options = pinsPaginatedQueryOptions('proj1', { initialDays: 3 })

    const initialParam = options.initialPageParam as { createdAfter?: Date }
    expect(initialParam.createdAfter).toBeInstanceOf(Date)

    // A page with a nextCursor yields the cursor as the next page param.
    expect(
      options.getNextPageParam({ pins: [], nextCursor: '2026-01-01' }, [], {} as any, []),
    ).toEqual({ cursor: '2026-01-01' })
    // No nextCursor → no further pages.
    expect(
      options.getNextPageParam({ pins: [], nextCursor: null }, [], {} as any, []),
    ).toBeUndefined()
  })

  it('resolves a page via getPinsPaginated forwarding the page param, status filter and page size', async () => {
    const page = { pins: [{ id: 'pin1' }], nextCursor: null }
    mockGetPinsPaginated.mockResolvedValueOnce(page)

    const options = pinsPaginatedQueryOptions('proj1', {
      statusFilter: ['draft'],
      pageSize: 50,
    })
    const result = await options.queryFn!({
      pageParam: { cursor: '2026-01-01' },
    } as any)

    expect(mockGetPinsPaginated).toHaveBeenCalledWith('proj1', {
      cursor: '2026-01-01',
      statusFilter: ['draft'],
      limit: 50,
    })
    expect(result).toEqual(page)
  })

  it('sets the project default 30s staleTime', () => {
    expect(pinsPaginatedQueryOptions('proj1').staleTime).toBe(30 * 1000)
  })
})
