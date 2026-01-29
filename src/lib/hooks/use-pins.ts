import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getPinsByProject,
  getPin,
  createPin,
  createPins,
  updatePin,
  deletePin,
  deletePins,
  updatePinsStatus,
  schedulePinsBulk,
  getBoardsByProject,
} from '@/lib/api/pins'
import type { PinStatus } from '@/types/pins'

export function usePins(projectId: string) {
  return useQuery({
    queryKey: ['pins', projectId],
    queryFn: () => getPinsByProject(projectId),
    enabled: !!projectId,
    staleTime: 30000,
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
      toast.success('Pin created')
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: () => {
      toast.error('Failed to create pin')
    },
  })
}

export function useCreatePins() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createPins,
    onSuccess: (data) => {
      toast.success(`${data.length} pins created`)
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: () => {
      toast.error('Failed to create pins')
    },
  })
}

export function useUpdatePin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updatePin,
    onSuccess: () => {
      toast.success('Pin updated')
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: () => {
      toast.error('Failed to update pin')
    },
  })
}

export function useDeletePin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deletePin,
    onSuccess: () => {
      toast.success('Pin deleted')
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: () => {
      toast.error('Failed to delete pin')
    },
  })
}

export function useBulkDeletePins() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deletePins,
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} pins deleted`)
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: () => {
      toast.error('Failed to delete pins')
    },
  })
}

export function useBulkUpdatePinStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: PinStatus }) =>
      updatePinsStatus(ids, status),
    onSuccess: (_data, { ids }) => {
      toast.success(`Status updated for ${ids.length} pins`)
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: () => {
      toast.error('Failed to update pin status')
    },
  })
}

export function useBulkSchedulePins() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      pin_ids,
      start_date,
      interval_days,
      time,
    }: {
      pin_ids: string[]
      start_date: Date
      interval_days: number
      time: string
    }) => schedulePinsBulk(pin_ids, start_date, interval_days, time),
    onSuccess: (_data, { pin_ids }) => {
      toast.success(`${pin_ids.length} pins scheduled`)
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    },
    onError: () => {
      toast.error('Failed to schedule pins')
    },
  })
}

export function useBoards(projectId: string) {
  return useQuery({
    queryKey: ['boards', projectId],
    queryFn: () => getBoardsByProject(projectId),
    enabled: !!projectId,
    staleTime: 30000,
  })
}
