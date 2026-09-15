// Generic pgmq queue worker loop (ADR-0004). One run:
//   1. take the per-queue worker lock (a second kick while a run is active exits)
//   2. read up to `batchSize` visible messages, hiding them for `visibilityTimeoutSeconds`
//   3. process them in parallel
//      - success                      -> delete the message
//      - failure, attempts left       -> leave it; it reappears after the visibility timeout
//      - failure on the last attempt  -> archive it and call `onFinalFailure` once
//   4. release the lock
//
// Queue access goes through service-role-only SQL wrappers around pgmq, so the
// pgmq schema does not need to be exposed over the Data API.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface QueueMessage<T> {
  msg_id: number
  read_ct: number
  message: T
}

export interface QueueWorkerOptions<T> {
  supabase: SupabaseClient
  queue: string
  maxAttempts: number
  process: (payload: T) => Promise<unknown>
  onFinalFailure: (payload: T, errorMessage: string) => Promise<void>
  batchSize?: number
  visibilityTimeoutSeconds?: number
}

export interface QueueWorkerResult {
  locked: boolean
  succeeded: number
  retrying: number
  failed: number
}

const DEFAULT_BATCH_SIZE = 5
// Just above the 400s Edge Function wall clock, so a still-running job never
// becomes visible to the next run.
const DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 420

export async function runQueueWorker<T>(opts: QueueWorkerOptions<T>): Promise<QueueWorkerResult> {
  const { supabase, queue } = opts
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE
  const vt = opts.visibilityTimeoutSeconds ?? DEFAULT_VISIBILITY_TIMEOUT_SECONDS
  const result: QueueWorkerResult = { locked: false, succeeded: 0, retrying: 0, failed: 0 }

  const { data: acquired, error: lockError } = await supabase.rpc('try_acquire_queue_worker_lock', {
    p_queue: queue,
    p_ttl_seconds: vt,
  })
  if (lockError) throw new Error(`Failed to acquire worker lock for ${queue}: ${lockError.message}`)
  if (!acquired) {
    result.locked = true
    return result
  }

  try {
    const { data: messages, error: readError } = await supabase.rpc('queue_read', {
      p_queue: queue,
      p_vt: vt,
      p_qty: batchSize,
    })
    if (readError) throw new Error(`Failed to read queue ${queue}: ${readError.message}`)

    await Promise.all(
      ((messages ?? []) as QueueMessage<T>[]).map(async (msg) => {
        const outcome = await handleMessage(opts, msg)
        result[outcome]++
      }),
    )
  } finally {
    const { error: releaseError } = await supabase.rpc('release_queue_worker_lock', { p_queue: queue })
    if (releaseError) {
      console.error(`[queue-worker] ${queue}: failed to release lock:`, releaseError.message)
    }
  }

  return result
}

async function handleMessage<T>(
  opts: QueueWorkerOptions<T>,
  msg: QueueMessage<T>,
): Promise<'succeeded' | 'retrying' | 'failed'> {
  const { supabase, queue, maxAttempts } = opts

  // A run that crashed or timed out on the last attempt leaves the message
  // visible again with read_ct past the limit: give up without another try.
  if (msg.read_ct > maxAttempts) {
    await finalFailure(opts, msg, `Abgebrochen nach ${maxAttempts} Versuchen`)
    return 'failed'
  }

  try {
    await opts.process(msg.message)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[queue-worker] ${queue} msg ${msg.msg_id} attempt ${msg.read_ct}/${maxAttempts}:`, errorMessage)
    if (msg.read_ct < maxAttempts) return 'retrying'
    await finalFailure(opts, msg, errorMessage)
    return 'failed'
  }

  const { error: deleteError } = await supabase.rpc('queue_delete', { p_queue: queue, p_msg_id: msg.msg_id })
  if (deleteError) {
    // The work is done; a leftover message only causes a harmless re-run.
    console.error(`[queue-worker] ${queue} msg ${msg.msg_id}: delete failed:`, deleteError.message)
  }
  return 'succeeded'
}

async function finalFailure<T>(opts: QueueWorkerOptions<T>, msg: QueueMessage<T>, errorMessage: string) {
  const { supabase, queue } = opts
  const { error: archiveError } = await supabase.rpc('queue_archive', { p_queue: queue, p_msg_id: msg.msg_id })
  if (archiveError) {
    console.error(`[queue-worker] ${queue} msg ${msg.msg_id}: archive failed:`, archiveError.message)
  }
  try {
    await opts.onFinalFailure(msg.message, errorMessage)
  } catch (err) {
    console.error(`[queue-worker] ${queue} msg ${msg.msg_id}: onFinalFailure threw:`, err)
  }
}
