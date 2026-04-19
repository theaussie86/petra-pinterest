import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import {
  createPinterestPin,
  registerPinterestMedia,
  uploadVideoToPinterestS3,
  waitForPinterestMediaReady,
} from './pinterest-api'
import { notifyPinError } from './notifications'
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

/**
 * Publish a single pin to Pinterest (manual/user-triggered)
 */
export const publishPinFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const serviceClient = getSupabaseServiceClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    // Verify pin belongs to user's tenant
    const { data: pin, error: fetchError } = await supabase
      .from('pins')
      .select('id')
      .eq('id', data.pin_id)
      .single()

    if (fetchError || !pin) {
      throw new Error('Pin not found or access denied')
    }

    // Publish the pin
    return await publishSinglePin(supabase, serviceClient, data.pin_id)
  })

/**
 * Publish multiple pins to Pinterest (bulk operation)
 */
export const publishPinsBulkFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_ids: string[] }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const serviceClient = getSupabaseServiceClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    // Verify all pins belong to user's tenant
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

    // Process pins sequentially with rate limiting
    const results: Array<{ id: string; success: boolean; error?: string }> = []

    for (let i = 0; i < data.pin_ids.length; i++) {
      const pinId = data.pin_ids[i]

      const result = await publishSinglePin(supabase, serviceClient, pinId)

      results.push({
        id: pinId,
        success: result.success,
        error: result.error,
      })

      // Add 10-second delay between pins (conservative rate limiting)
      if (i < data.pin_ids.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10000))
      }
    }

    const published = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    return {
      total: data.pin_ids.length,
      published,
      failed,
      results,
    }
  })
