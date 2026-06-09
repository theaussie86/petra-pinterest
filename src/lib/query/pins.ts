import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { subDays } from 'date-fns'
import { getPinsPaginated, getPinsByProject, type PaginatedPinsResult } from '@/lib/api/pins'
import type { Pin } from '@/types/pins'

const PROCESSING_STATUSES = ['generating_metadata', 'generate_metadata']

export function hasProcessingPin(pins: { status: string }[] | undefined) {
  return pins?.some((p) => PROCESSING_STATUSES.includes(p.status)) ?? false
}

/**
 * The cache key for a project's full (non-paginated) pin list. Matches the
 * existing `['pins', projectId]` key so the pins-list/calendar realtime
 * invalidation (`['pins', projectId]`) and the broad pin-mutation invalidation
 * (`['pins']`, a prefix) keep refreshing it.
 */
export function pinsByProjectQueryKey(projectId: string) {
  return ['pins', projectId] as const
}

/**
 * Shared query options for a project's full pin list — the single source of
 * truth referenced by both the calendar route loader
 * (`ensureQueryData(pinsByProjectQueryOptions(projectId))`) and the consuming
 * `usePins`/`usePinsSuspense` hooks, so the scheduled pins arrive in the SSR HTML
 * and hydrate without a client refetch. Keeps the 3s poll while a pin is
 * processing metadata so the calendar reflects generation progress.
 */
export function pinsByProjectQueryOptions(projectId: string) {
  return queryOptions<Pin[]>({
    queryKey: pinsByProjectQueryKey(projectId),
    queryFn: () => getPinsByProject(projectId),
    staleTime: 30 * 1000,
    refetchInterval: (query) => (hasProcessingPin(query.state.data) ? 3000 : false),
  })
}

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
