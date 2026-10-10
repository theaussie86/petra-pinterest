import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import {
  createPinterestPin,
  registerPinterestMedia,
  uploadVideoToPinterestS3,
  waitForPinterestMediaReady,
} from './pinterest-api'
import { notifyPinError } from './notifications'
import { enqueueManualPublishPin } from './mq'
import { buildAiDisclosures } from '@/lib/ai-disclosure'
import type { PinterestCreatePinPayload, PinterestMediaSource } from '@/types/pinterest'

interface PublishResult {
  success: boolean
  pinterest_pin_id?: string
  error?: string
}

/**
 * Core publish logic shared by manual and bulk operations
 * Exported for use by Edge Functions
 */
export async function publishSinglePin(
  supabase: ReturnType<typeof getSupabaseServerClient | typeof getSupabaseServiceClient>,
  serviceClient: ReturnType<typeof getSupabaseServiceClient>,
  pinId: string,
): Promise<PublishResult> {
  try {
    // Fetch pin with related data
    const { data: pin, error: fetchError } = await supabase
      .from('pins')
      .select('*, blog_articles(url), blog_projects(pinterest_connection_id)')
      .eq('id', pinId)
      .single()

    if (fetchError || !pin) {
      throw new Error(`Pin not found: ${pinId}`)
    }

    // Validate pin is ready to publish
    if (!pin.pinterest_board_id) {
      throw new Error('Pin must have a Pinterest board assigned')
    }

    if (!pin.blog_projects?.pinterest_connection_id) {
      throw new Error('No Pinterest account connected to this project')
    }

    if (!pin.image_path) {
      throw new Error('Pin must have an image')
    }

    // Get access token from Vault via service client
    const { data: tokenData, error: tokenError } = await serviceClient.rpc(
      'get_pinterest_access_token',
      { p_connection_id: pin.blog_projects.pinterest_connection_id }
    )

    if (tokenError || !tokenData) {
      throw new Error(`Failed to retrieve Pinterest access token: ${tokenError?.message || 'Unknown error'}`)
    }

    const accessToken = tokenData as string

    const mediaPublicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/pin-images/${pin.image_path}`

    let mediaSource: PinterestMediaSource

    if (pin.media_type === 'video') {
      // Step 1: Register a media slot with Pinterest
      const registration = await registerPinterestMedia(accessToken)

      // Step 2: Fetch video bytes from Supabase Storage
      const videoResponse = await fetch(mediaPublicUrl)
      if (!videoResponse.ok) {
        throw new Error(
          `Failed to fetch video from storage: ${videoResponse.status} ${videoResponse.statusText}`,
        )
      }
      const videoBytes = new Uint8Array(await videoResponse.arrayBuffer())
      const filename = pin.image_path!.split('/').pop() ?? 'video.mp4'

      // Step 3: Upload bytes to Pinterest's S3
      await uploadVideoToPinterestS3(registration, videoBytes, filename)

      // Step 4: Poll until Pinterest finishes processing
      await waitForPinterestMediaReady(accessToken, registration.media_id)

      // Step 5: Build video source with cover
      const videoSource: Extract<PinterestMediaSource, { source_type: 'video_id' }> = {
        source_type: 'video_id',
        media_id: registration.media_id,
      }
      if (pin.cover_image_path) {
        videoSource.cover_image_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/pin-images/${pin.cover_image_path}`
      } else {
        videoSource.cover_image_key_frame_time = pin.cover_keyframe_seconds ?? 1
      }
      mediaSource = videoSource
    } else {
      mediaSource = { source_type: 'image_url', url: mediaPublicUrl }
    }

    // Build Pinterest API payload
    const payload: PinterestCreatePinPayload = {
      board_id: pin.pinterest_board_id,
      media_source: mediaSource,
    }

    // Add optional fields (with length limits)
    if (pin.title) {
      payload.title = pin.title.substring(0, 100)
    }
    if (pin.description) {
      payload.description = pin.description.substring(0, 800)
    }
    if (pin.alt_text) {
      payload.alt_text = pin.alt_text.substring(0, 500)
    }
    const linkUrl = pin.alternate_url ?? pin.blog_articles?.url
    if (linkUrl) {
      payload.link = linkUrl
    }

    // AI disclosure (Pinterest Pflicht-Kennzeichnung): map the persisted
    // booleans to ai_disclosures.values; omit the field entirely when neither
    // applies. DB defaults (ai_modified=true) make this the default-on case.
    const aiDisclosures = buildAiDisclosures(
      pin.ai_modified ?? true,
      pin.synthetic_performer ?? false,
    )
    if (aiDisclosures) {
      payload.ai_disclosures = aiDisclosures
    }

    // Call Pinterest API
    const result = await createPinterestPin(accessToken, payload)

    // On success: update pin with published status
    await supabase
      .from('pins')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        pinterest_pin_id: result.id,
        pinterest_pin_url: `https://www.pinterest.com/pin/${result.id}/`,
      })
      .eq('id', pinId)

    return {
      success: true,
      pinterest_pin_id: result.id,
    }
  } catch (error) {
    // On error: update pin with error status
    const errorMessage = error instanceof Error ? error.message : String(error)

    await supabase
      .from('pins')
      .update({
        status: 'error',
        error_message: errorMessage,
      })
      .eq('id', pinId)

    // Fire-and-forget error mail (never throws)
    await notifyPinError({
      supabase: serviceClient,
      pinId,
      errorMessage,
    })

    return {
      success: false,
      error: errorMessage,
    }
  }
}

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
