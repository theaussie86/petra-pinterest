import { infiniteQueryOptions } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { getPinsPaginated, type PaginatedPinsResult } from '@/lib/api/pins'

export interface PinsPaginatedOptions {
  statusFilter?: string[]
  initialDays?: number
  pageSize?: number
}

export type PinsPaginationPageParam = {
  createdAfter?: Date
  cursor?: string
}

/**
 * The cache key for a project's paginated pins. Nested under `['pins', projectId]`
 * so the existing pin mutation invalidation (`['pins']`) and the pins-list
 * realtime invalidation (`['pins', projectId]`) match it by prefix, and reflecting
 * the status filter so each filter combination gets its own infinite-query entry.
 */
export function pinsPaginatedQueryKey(projectId: string, statusFilter: string[] | undefined) {
  return ['pins', projectId, 'paginated', statusFilter] as const
}

/**
 * Shared infinite-query options for a project's paginated pins — the single
 * source of truth referenced by both the pins-list route loader
 * (`prefetchInfiniteQuery(pinsPaginatedQueryOptions(projectId))`, which fetches
 * the first page server-side) and the consuming `useSuspenseInfiniteQuery` hook,
 * so the first page arrives in the SSR HTML and additional pages stream via the
 * existing `created_at` cursor pagination.
 */
export function pinsPaginatedQueryOptions(
  projectId: string,
  options: PinsPaginatedOptions = {},
) {
  const { statusFilter, initialDays = 3, pageSize = 20 } = options

  return infiniteQueryOptions({
    queryKey: pinsPaginatedQueryKey(projectId, statusFilter),
    queryFn: ({ pageParam }: { pageParam: PinsPaginationPageParam }) =>
      getPinsPaginated(projectId, {
        ...pageParam,
        statusFilter,
        limit: pageSize,
      }),
    initialPageParam: {
      createdAfter: subDays(new Date(), initialDays),
    } satisfies PinsPaginationPageParam,
    getNextPageParam: (lastPage: PaginatedPinsResult): PinsPaginationPageParam | undefined =>
      lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
    staleTime: 30 * 1000,
  })
}
