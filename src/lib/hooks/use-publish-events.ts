import { useInfiniteQuery } from '@tanstack/react-query'
import {
  getPublishEvents,
  type PaginatedPublishEventsResult,
} from '@/lib/api/publish-events'
import type { PinPublishEventType } from '@/types/pins'

export interface PublishEventsFilters {
  projectId?: string
  eventTypes?: PinPublishEventType[]
  createdAfter?: Date
}

const PAGE_SIZE = 50

type PageParam = { cursor?: string }

/**
 * Infinite-query hook for the global publish log (issue #111). The filters are
 * baked into the query key so each filter combination is its own cache entry;
 * the realtime INSERT subscription invalidates by the `['publish-events']`
 * prefix, so a new event refetches whichever filtered view is active (newest
 * first) without clearing the filters.
 */
export function usePublishEvents(filters: PublishEventsFilters = {}) {
  const { projectId, eventTypes, createdAfter } = filters

  return useInfiniteQuery({
    queryKey: [
      'publish-events',
      projectId ?? null,
      eventTypes ? [...eventTypes].sort() : null,
      createdAfter ? createdAfter.toISOString() : null,
    ],
    queryFn: ({ pageParam }: { pageParam: PageParam }) =>
      getPublishEvents({
        cursor: pageParam.cursor,
        limit: PAGE_SIZE,
        projectId,
        eventTypes,
        createdAfter,
      }),
    initialPageParam: {} as PageParam,
    getNextPageParam: (lastPage: PaginatedPublishEventsResult): PageParam | undefined =>
      lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
    staleTime: 30000,
  })
}
