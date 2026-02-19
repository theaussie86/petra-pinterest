import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import {
  getPinsByProject,
  getPinsByArticle,
  getAllPins,
  getPin,
  createPin,
  createPins,
  updatePin,
  deletePin,
  deletePins,
  updatePinsStatus,
} from '@/lib/api/pins'
import type { PinStatus } from '@/types/pins'

const PROCESSING_STATUSES = ['generating_metadata', 'generate_metadata']

function hasProcessingPin(pins: { status: string }[] | undefined) {
  return pins?.some((p) => PROCESSING_STATUSES.includes(p.status)) ?? false
}

export function usePins(projectId: string) {
  return useQuery({
    queryKey: ['pins', projectId],
    queryFn: () => getPinsByProject(projectId),
    enabled: !!projectId,
    staleTime: 30000,
    refetchInterval: (query) => (hasProcessingPin(query.state.data) ? 3000 : false),
  })
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
    queryKey: ['pins', 'detail', id],
    queryFn: () => getPin(id),
    enabled: !!id,
  })
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
