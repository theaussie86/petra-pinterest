import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import {
  getPinsByArticle,
  getAllPins,
  createPin,
  createPins,
  updatePin,
  deletePin,
  deletePins,
  updatePinsStatus,
} from '@/lib/api/pins'
import {
  pinsPaginatedQueryOptions,
  pinsByProjectQueryOptions,
  pinQueryOptions,
  hasProcessingPin,
  type PinsPaginatedOptions,
} from '@/lib/query/pins'
import type { PinStatus } from '@/types/pins'

export function usePins(projectId: string) {
  return useQuery({
    ...pinsByProjectQueryOptions(projectId),
    enabled: !!projectId,
  })
}

/**
 * Suspense variant for the calendar route that prefetches the project's pins in
 * its loader (SSR). Shares `pinsByProjectQueryOptions` (cache key
 * `['pins', projectId]`) with `usePins` and the loader, so loader-prefetched data
 * hydrates without a client refetch (no loading flash) and `data` is always
 * defined. Mutation/realtime invalidation on `['pins']`/`['pins', projectId]`
 * triggers a background refetch shown without a fallback flash.
 */
export function usePinsSuspense(projectId: string) {
  return useSuspenseQuery(pinsByProjectQueryOptions(projectId))
}

export function useArticlePins(articleId: string) {
  return useQuery({
    queryKey: ['pins', 'article', articleId],
    queryFn: () => getPinsByArticle(articleId),
    enabled: !!articleId,
    staleTime: 30000,
    refetchInterval: (query) => (hasProcessingPin(query.state.data) ? 3000 : false),
  })
}

export function useAllPins() {
  return useQuery({
    queryKey: ['pins', 'all'],
    queryFn: getAllPins,
    staleTime: 30000,
    refetchInterval: (query) => (hasProcessingPin(query.state.data) ? 3000 : false),
  })
}

export function usePin(id: string) {
  return useQuery({
    ...pinQueryOptions(id),
    enabled: !!id,
  })
}

/**
 * Suspense variant for the pin-detail route that prefetches the record in its
 * loader (SSR). Shares `pinQueryOptions` (cache key `['pins', 'detail', id]`)
 * with `usePin` and the loader, so loader-prefetched data hydrates without a
 * client refetch and `data` is always defined.
 */
export function usePinSuspense(id: string) {
  return useSuspenseQuery(pinQueryOptions(id))
}

export function usePinsPaginated(projectId: string, options: PinsPaginatedOptions = {}) {
  return useInfiniteQuery({
    ...pinsPaginatedQueryOptions(projectId, options),
    enabled: !!projectId,
  })
}

/**
 * Suspense variant for the pins-list route that prefetches the first page in its
 * loader (SSR) via `prefetchInfiniteQuery`. Shares `pinsPaginatedQueryOptions`
 * (cache key `['pins', projectId, 'paginated', statusFilter]`) with
 * `usePinsPaginated` and the loader, so the first page hydrates without a client
 * refetch (no loading flash) and `data.pages` is always defined.
 */
export function usePinsPaginatedSuspense(projectId: string, options: PinsPaginatedOptions = {}) {
  return useSuspenseInfiniteQuery(pinsPaginatedQueryOptions(projectId, options))
}

export function useCreatePin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createPin,
    onSuccess: () => {
      toast.success(i18n.t('toast.pin.created'))
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.pin.createFailed', { error: error.message }))
    },
  })
}

export function useCreatePins() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createPins,
    onSuccess: (data) => {
      toast.success(i18n.t('toast.pin.multipleCreated', { count: data.length }))
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.pin.multipleCreateFailed', { error: error.message }))
    },
  })
}

export function useUpdatePin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updatePin,
    onSuccess: () => {
      toast.success(i18n.t('toast.pin.updated'))
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.pin.updateFailed', { error: error.message }))
    },
  })
}

export function useDeletePin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deletePin,
    onSuccess: () => {
      toast.success(i18n.t('toast.pin.deleted'))
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.pin.deleteFailed', { error: error.message }))
    },
  })
}

export function useBulkDeletePins() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deletePins,
    onSuccess: (_data, ids) => {
      toast.success(i18n.t('toast.pin.multipleDeleted', { count: ids.length }))
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.pin.multipleDeleteFailed', { error: error.message }))
    },
  })
}

export function useBulkUpdatePinStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: PinStatus }) =>
      updatePinsStatus(ids, status),
    onSuccess: (_data, { ids }) => {
      toast.success(i18n.t('toast.pin.statusUpdated', { count: ids.length }))
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: (error: Error) => {
      toast.error(i18n.t('toast.pin.statusUpdateFailed', { error: error.message }))
    },
  })
}
