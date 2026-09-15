import type { PinStatus } from '@/types/pins'

export interface MetadataProgress {
  /** Number of pins the job was started for. */
  total: number
  /** Pins that reached a successful terminal status. */
  done: number
  /** Pins that reached the error terminal status. */
  failed: number
  /** Pins still working (or missing from the status query). */
  pending: number
  /** True once no pin is still working. */
  finished: boolean
  /** Overall result once finished, otherwise null. */
  outcome: 'success' | 'partial' | 'error' | null
}

/**
 * Derive bulk-metadata progress from the current pin statuses read from the
 * database (issue #89). A pin lands on `metadata_created` (success) or `error`
 * (failure) when generation finishes; anything else still counts as pending.
 * `published` is treated as done too, in case a pin auto-publishes between
 * polls. `total` is the number of requested pins, so rows missing from the
 * query (e.g. deleted pins) keep the job pending rather than finishing early.
 */
export function computeMetadataProgress(
  statuses: PinStatus[],
  total: number,
): MetadataProgress {
  let done = 0
  let failed = 0
  for (const status of statuses) {
    if (status === 'metadata_created' || status === 'published') done++
    else if (status === 'error') failed++
  }

  const pending = Math.max(0, total - done - failed)
  const finished = total > 0 && pending === 0

  let outcome: MetadataProgress['outcome'] = null
  if (finished) {
    outcome = failed === 0 ? 'success' : done === 0 ? 'error' : 'partial'
  }

  return { total, done, failed, pending, finished, outcome }
}
