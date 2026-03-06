import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { batch } from '@trigger.dev/sdk/v3'

interface BatchProgress {
  total: number
  completed: number
  failed: number
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL_FAILED' | 'ABORTED'
}

/**
 * Hook to track Trigger.dev batch progress with toast notifications.
 * Polls the batch status and updates a persistent toast with progress.
 */
export function useTriggerBatchProgress(batchId: string | null, label: string) {
  const [progress, setProgress] = useState<BatchProgress | null>(null)

  const pollProgress = useCallback(async (id: string, toastId: string | number) => {
    try {
      const result = await batch.retrieve(id)

      const newProgress: BatchProgress = {
        total: result.runCount,
        completed: result.successfulRunCount ?? 0,
        failed: result.failedRunCount ?? 0,
        status: result.status as BatchProgress['status'],
      }

      setProgress(newProgress)

      if (result.status === 'COMPLETED') {
        toast.success(`${label} complete`, {
          id: toastId,
          description: `${newProgress.completed} succeeded`,
        })
        return true
      } else if (result.status === 'PARTIAL_FAILED') {
        toast.warning(`${label} completed with errors`, {
          id: toastId,
          description: `${newProgress.completed} succeeded, ${newProgress.failed} failed`,
        })
        return true
      } else if (result.status === 'ABORTED') {
        toast.error(`${label} aborted`, { id: toastId })
        return true
      } else {
        toast.loading(`${label}... ${newProgress.completed}/${newProgress.total} complete`, {
          id: toastId,
        })
        return false
      }
    } catch {
      return false
    }
  }, [label])

  useEffect(() => {
    if (!batchId) return

    const toastId = toast.loading(`${label}... starting`)

    const interval = setInterval(async () => {
      const done = await pollProgress(batchId, toastId)
      if (done) clearInterval(interval)
    }, 2000)

    // Initial poll
    pollProgress(batchId, toastId)

    return () => clearInterval(interval)
  }, [batchId, label, pollProgress])

  return progress
}
