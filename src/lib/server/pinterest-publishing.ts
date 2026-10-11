import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from './supabase'
import { enqueueManualPublishPin } from './mq'

interface QueueResult {
  id: string
  success: boolean
  error?: string
}

/**
 * Manual publish via the MQ: prepare the pin as a publish candidate
 * (`status = metadata_created`, `scheduled_at = now`, error cleared) and enqueue
 * an immediate job. The MQ worker owns retries, the 10 s per-connection rate
 * limit and the error mail; the result lands in `pins.status` (issue #106).
 *
 * Prerequisites are checked here so the user gets an instant error instead of
 * an unrecoverable worker failure. If enqueueing fails, the pin is restored.
 */
async function queueManualPublish(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  pinId: string,
): Promise<QueueResult> {
  const { data: pinRow, error: fetchError } = await supabase
    .from('pins')
    .select(
      'id, tenant_id, status, scheduled_at, error_message, pinterest_pin_id, pinterest_board_id, image_path, blog_projects(pinterest_connection_id)',
    )
    .eq('id', pinId)
    .single()

  if (fetchError || !pinRow) {
    return { id: pinId, success: false, error: 'Pin not found or access denied' }
  }
  const pin = pinRow as unknown as typeof pinRow & {
    blog_projects: { pinterest_connection_id: string | null } | null
  }
  if (pin.pinterest_pin_id || pin.status === 'published') {
    return { id: pinId, success: false, error: 'Pin is already published' }
  }
  if (!pin.pinterest_board_id) {
    return { id: pinId, success: false, error: 'Pin must have a Pinterest board assigned' }
  }
  if (!pin.blog_projects?.pinterest_connection_id) {
    return { id: pinId, success: false, error: 'No Pinterest account connected to this project' }
  }
  if (!pin.image_path) {
    return { id: pinId, success: false, error: 'Pin must have an image' }
  }

  const scheduledAt = new Date().toISOString()
  const { error: prepareError } = await supabase
    .from('pins')
    .update({ status: 'metadata_created', scheduled_at: scheduledAt, error_message: null })
    .eq('id', pinId)

  if (prepareError) {
    return { id: pinId, success: false, error: prepareError.message }
  }

  const enqueued = await enqueueManualPublishPin({
    pinId,
    scheduledAt,
    tenantId: pin.tenant_id,
  })

  if (enqueued.status === 'error') {
    await supabase
      .from('pins')
      .update({
        status: pin.status,
        scheduled_at: pin.scheduled_at,
        error_message: pin.error_message,
      })
      .eq('id', pinId)
    return {
      id: pinId,
      success: false,
      error: `Publish queue unavailable: ${enqueued.error.message}`,
    }
  }

  return { id: pinId, success: true }
}

/**
 * Queue a single pin for publishing (manual/user-triggered). Resolves once the
 * job is enqueued; the outcome is written to `pins.status` by the MQ worker.
 */
export const publishPinFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    const result = await queueManualPublish(supabase, data.pin_id)
    if (!result.success) {
      throw new Error(result.error)
    }
    return { queued: true as const, pin_id: data.pin_id }
  })

/**
 * Queue multiple pins for publishing (bulk). No app-side delay: the MQ worker
 * rate-limits per Pinterest connection.
 */
export const publishPinsBulkFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_ids: string[] }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    const { data: pins, error: fetchError } = await supabase
      .from('pins')
      .select('id')
      .in('id', data.pin_ids)

    if (fetchError) {
      throw new Error('Failed to verify pin access')
    }

    if (!pins || pins.length !== data.pin_ids.length) {
      throw new Error('Some pins not found or access denied')
    }

    const results: QueueResult[] = []
    for (const pinId of data.pin_ids) {
      results.push(await queueManualPublish(supabase, pinId))
    }

    const queued = results.filter((r) => r.success).length

    return {
      total: data.pin_ids.length,
      queued,
      failed: results.length - queued,
      results,
    }
  })
