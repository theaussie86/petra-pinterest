import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { notifyPinError } from '../_shared/notifications.ts'
import { generateAndStorePinMetadata, type PinMetadataJob } from '../_shared/pin-metadata.ts'
import { runQueueWorker } from '../_shared/queue-worker.ts'
import { AiMetadataDisabledError, releasePinFromGeneration } from '../_shared/ai-metadata-setting.ts'

// Drains the generate_metadata queue. Kicked by pg_cron only when messages are
// waiting (ADR-0004). A pin stays `generating_metadata` across retries; `error`
// and the notification mail happen only after the last attempt.
// A job for a tenant that switched AI metadata off (ADR-0009) is dropped: no
// Gemini call, no error status, no mail; the pin goes back to its previous
// resting status and the message is deleted like a success.
Deno.serve(async () => {
  const supabase = createServiceClient()

  try {
    const result = await runQueueWorker<PinMetadataJob>({
      supabase,
      queue: 'generate_metadata',
      maxAttempts: 3,
      process: async (job) => {
        try {
          await generateAndStorePinMetadata(supabase, job)
        } catch (error) {
          if (!(error instanceof AiMetadataDisabledError)) throw error
          console.log(`[generate-metadata-worker] AI metadata off for tenant, dropping pin ${job.pin_id}`)
          await releasePinFromGeneration(supabase, job.pin_id)
        }
      },
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
