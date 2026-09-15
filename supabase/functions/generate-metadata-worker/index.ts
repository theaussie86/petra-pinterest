import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { notifyPinError } from '../_shared/notifications.ts'
import { generateAndStorePinMetadata, type PinMetadataJob } from '../_shared/pin-metadata.ts'
import { runQueueWorker } from '../_shared/queue-worker.ts'

// Drains the generate_metadata queue. Kicked by pg_cron only when messages are
// waiting (ADR-0004). A pin stays `generating_metadata` across retries; `error`
// and the notification mail happen only after the last attempt.
Deno.serve(async () => {
  const supabase = createServiceClient()

  try {
    const result = await runQueueWorker<PinMetadataJob>({
      supabase,
      queue: 'generate_metadata',
      maxAttempts: 3,
      process: (job) => generateAndStorePinMetadata(supabase, job),
      onFinalFailure: async (job, errorMessage) => {
        const { error } = await supabase
          .from('pins')
          .update({ status: 'error', error_message: errorMessage })
          .eq('id', job.pin_id)
        if (error) {
          console.error('[generate-metadata-worker] Failed to set error status:', error.message)
        }
        await notifyPinError({ supabase, pinId: job.pin_id, errorMessage })
      },
    })

    return Response.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[generate-metadata-worker] Error:', message)
    return Response.json({ success: false, error: message }, { status: 500 })
  }
})
