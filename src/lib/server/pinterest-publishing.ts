import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import { createPinterestPin } from './pinterest-api'
import type { PinterestCreatePinPayload } from '@/types/pinterest'

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

    // Get public URL for pin image
    const imagePublicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/pin-images/${pin.image_path}`

    // Build Pinterest API payload
    const payload: PinterestCreatePinPayload = {
      board_id: pin.pinterest_board_id,
      media_source: {
        source_type: 'image_url',
        url: imagePublicUrl,
      },
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
