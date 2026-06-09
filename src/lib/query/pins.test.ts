import {
  pinsPaginatedQueryOptions,
  pinsPaginatedQueryKey,
  pinsByProjectQueryOptions,
  pinsByProjectQueryKey,
  pinQueryOptions,
  pinQueryKey,
} from './pins'

const { mockGetPinsPaginated, mockGetPinsByProject, mockGetPin } = vi.hoisted(() => ({
  mockGetPinsPaginated: vi.fn(),
  mockGetPinsByProject: vi.fn(),
  mockGetPin: vi.fn(),
}))

vi.mock('@/lib/api/pins', () => ({
  getPinsPaginated: (...args: any[]) => mockGetPinsPaginated(...args),
  getPinsByProject: (...args: any[]) => mockGetPinsByProject(...args),
  getPin: (...args: any[]) => mockGetPin(...args),
}))

describe('pinQueryOptions', () => {
  it('uses a stable ["pins", "detail", id] key reflecting the pin id', () => {
    expect(pinQueryOptions('pin1').queryKey).toEqual(['pins', 'detail', 'pin1'])
    expect(pinQueryKey('pin1')).toEqual(['pins', 'detail', 'pin1'])
  })

  it('keys distinct pins separately so loader and hook share one entry per id', () => {
    expect(pinQueryOptions('pin1').queryKey).not.toEqual(pinQueryOptions('pin2').queryKey)
  })

  it('nests under the ["pins"] key so pin mutations/invalidation also refresh the detail', () => {
    // ['pins'] is a prefix of ['pins', 'detail', id], so
    // invalidateQueries({ queryKey: ['pins'] }) matches the detail too.
    expect(pinQueryOptions('pin1').queryKey.slice(0, 1)).toEqual(['pins'])
  })

  it('sets the project default 30s staleTime', () => {
    expect(pinQueryOptions('pin1').staleTime).toBe(30 * 1000)
  })

  it('resolves the pin via the getPin api function with the id', async () => {
    const pin = { id: 'pin1' }
    mockGetPin.mockResolvedValueOnce(pin)

    const result = await pinQueryOptions('pin1').queryFn!({} as any)

    expect(mockGetPin).toHaveBeenCalledWith('pin1')
    expect(result).toEqual(pin)
  })
})

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

describe('pinsByProjectQueryOptions', () => {
  it('uses a stable ["pins", projectId] key reflecting the project id', () => {
    expect(pinsByProjectQueryOptions('proj1').queryKey).toEqual(['pins', 'proj1'])
    expect(pinsByProjectQueryKey('proj1')).toEqual(['pins', 'proj1'])
  })

  it('keys distinct projects separately so loader and hook share one entry per id', () => {
    expect(pinsByProjectQueryOptions('proj1').queryKey).not.toEqual(
      pinsByProjectQueryOptions('proj2').queryKey,
    )
  })

  it('nests under the ["pins"] key so pin mutations/realtime invalidation also refresh it', () => {
    // ['pins'] and ['pins', projectId] are prefixes/matches, so existing
    // invalidateQueries on those keys match the calendar query too.
    expect(pinsByProjectQueryOptions('proj1').queryKey.slice(0, 1)).toEqual(['pins'])
  })

  it('resolves the pins via getPinsByProject forwarding the project id', async () => {
    const pins = [{ id: 'pin1' }]
    mockGetPinsByProject.mockResolvedValueOnce(pins)

    const result = await pinsByProjectQueryOptions('proj1').queryFn!({} as any)

    expect(mockGetPinsByProject).toHaveBeenCalledWith('proj1')
    expect(result).toEqual(pins)
  })

  it('sets the project default 30s staleTime', () => {
    expect(pinsByProjectQueryOptions('proj1').staleTime).toBe(30 * 1000)
  })

  it('polls every 3s while a pin is processing and stops otherwise', () => {
    const refetchInterval = pinsByProjectQueryOptions('proj1').refetchInterval as (
      query: any,
    ) => number | false

    expect(
      refetchInterval({ state: { data: [{ status: 'generating_metadata' }] } }),
    ).toBe(3000)
    expect(refetchInterval({ state: { data: [{ status: 'published' }] } })).toBe(false)
    expect(refetchInterval({ state: { data: undefined } })).toBe(false)
  })
})
