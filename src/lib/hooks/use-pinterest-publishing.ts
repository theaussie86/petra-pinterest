import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { publishPinFn, publishPinsBulkFn } from '@/lib/server/pinterest-publishing'
import { getPin } from '@/lib/api/pins'

const POLL_INTERVAL_MS = 5000
// Worker retries back off 5 + 10 + 20 min, so a pin can stay queued for ~35 min.
const POLL_TIMEOUT_MS = 40 * 60 * 1000

/**
 * The MQ worker writes the outcome to `pins.status`; poll it so the user still
 * gets a result toast. Stops silently on timeout (the pin list stays correct
 * through query invalidation / realtime).
 */
async function watchPublishResult(
  pinId: string,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const toastId = `publish-${pinId}`
  toast.loading(i18n.t('toast.publish.queued'), { id: toastId })
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    try {
      const pin = await getPin(pinId)
      if (pin.status === 'published') {
        queryClient.invalidateQueries({ queryKey: ['pins'] })
        toast.success(i18n.t('toast.publish.published'), { id: toastId })
        return
      }
      if (pin.status === 'error') {
        queryClient.invalidateQueries({ queryKey: ['pins'] })
        toast.error(
          i18n.t('toast.publish.failed', { error: pin.error_message ?? '' }),
          { id: toastId },
        )
        return
      }
    } catch {
      // transient read failure - keep polling
    }
  }
  toast.dismiss(toastId)
}

/**
 * Hook: Queue a single pin for publishing via the MQ
 */
export function usePublishPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pin_id }: { pin_id: string }) => {
      const result = await publishPinFn({ data: { pin_id } })
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      void watchPublishResult(result.pin_id, queryClient)
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['pins'] }) // Status may have changed to error
      toast.error(i18n.t('toast.publish.failed', { error: error.message }))
    },
  })
}

/**
 * Hook: Queue multiple pins for publishing via the MQ (bulk operation)
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
      toast.success(i18n.t('toast.publish.bulkQueued', { queued: result.queued, total: result.total }))
      for (const r of result.results) {
        if (!r.success) toast.error(i18n.t('toast.publish.failed', { error: r.error ?? '' }))
      }
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      toast.error(i18n.t('toast.publish.bulkFailed', { error: error.message }))
    },
  })
}
