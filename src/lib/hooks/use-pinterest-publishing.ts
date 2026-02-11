import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { publishPinFn, publishPinsBulkFn } from '@/lib/server/pinterest-publishing'

/**
 * Hook: Publish a single pin to Pinterest
 */
export function usePublishPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pin_id }: { pin_id: string }) => {
      const result = await publishPinFn({ data: { pin_id } })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      toast.success(i18n.t('toast.publish.published'))
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['pins'] }) // Status may have changed to error
      toast.error(i18n.t('toast.publish.failed', { error: error.message }))
    },
  })
}

/**
 * Hook: Publish multiple pins to Pinterest (bulk operation)
 */
export function usePublishPinsBulk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pin_ids }: { pin_ids: string[] }) => {
      const result = await publishPinsBulkFn({ data: { pin_ids } })
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      toast.success(i18n.t('toast.publish.bulkSuccess', { published: result.published, total: result.total }))
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      toast.error(i18n.t('toast.publish.bulkFailed', { error: error.message }))
    },
  })
}
