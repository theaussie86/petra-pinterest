import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
      toast.success('Pin published to Pinterest!')
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['pins'] }) // Status may have changed to error
      toast.error(`Publish failed: ${error.message}`)
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
      toast.success(`Published ${result.published}/${result.total} pins`)
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      toast.error(`Bulk publish failed: ${error.message}`)
    },
  })
}
