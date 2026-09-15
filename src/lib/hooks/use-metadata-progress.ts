import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import { getPinStatusesById } from '@/lib/api/pins'
import { computeMetadataProgress, type MetadataProgress } from '@/lib/metadata-progress'
import type { PinStatus } from '@/types/pins'

const POLL_INTERVAL_MS = 2000
// Stop polling after five minutes so a stuck job can't leave a toast spinning
// forever (the queue worker retries independently of the UI).
const MAX_DURATION_MS = 5 * 60 * 1000

/**
 * Track bulk metadata generation by polling the affected pins' status in the
 * database (issue #89). Shows a persistent progress toast that ends with
 * success, a partial-failure warning, or an error — replacing the removed
 * Trigger.dev batch-progress hook. Pass a fresh, stable array of pin ids to
 * start a run; pass `null` when there is nothing to track.
 */
export function useMetadataBatchProgress(pinIds: string[] | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!pinIds || pinIds.length === 0) return

    const total = pinIds.length
    const toastId = toast.loading(
      i18n.t('toast.metadata.bulkProgress', { done: 0, total }),
    )
    let stopped = false
    let elapsed = 0

    const invalidatePins = () => {
      queryClient.invalidateQueries({ queryKey: ['pins'] })
      queryClient.invalidateQueries({ queryKey: ['pin-status-counts'] })
    }

    const finish = (progress: MetadataProgress) => {
      if (progress.outcome === 'success') {
        toast.success(i18n.t('toast.metadata.bulkComplete', { count: progress.done }), {
          id: toastId,
        })
      } else if (progress.outcome === 'partial') {
        toast.warning(
          i18n.t('toast.metadata.bulkPartial', {
            done: progress.done,
            failed: progress.failed,
          }),
          { id: toastId },
        )
      } else {
        toast.error(i18n.t('toast.metadata.bulkError'), { id: toastId })
      }
      invalidatePins()
    }

    const poll = async (): Promise<boolean> => {
      let rows: { id: string; status: PinStatus }[]
      try {
        rows = await getPinStatusesById(pinIds)
      } catch {
        return false // transient read error — try again on the next tick
      }
      if (stopped) return true

      const progress = computeMetadataProgress(
        rows.map((r) => r.status),
        total,
      )
      invalidatePins()

      if (progress.finished) {
        finish(progress)
        return true
      }

      toast.loading(i18n.t('toast.metadata.bulkProgress', { done: progress.done, total }), {
        id: toastId,
      })
      return false
    }

    const interval = setInterval(async () => {
      elapsed += POLL_INTERVAL_MS
      const done = await poll()
      if (done || elapsed >= MAX_DURATION_MS) {
        clearInterval(interval)
        if (!done) toast.dismiss(toastId)
      }
    }, POLL_INTERVAL_MS)

    // Immediate first read: pins enqueued moments ago may already be finished.
    void poll().then((done) => {
      if (done) clearInterval(interval)
    })

    return () => {
      stopped = true
      clearInterval(interval)
    }
  }, [pinIds, queryClient])
}
