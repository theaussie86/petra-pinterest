import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  createPinterestPin,
  registerPinterestMedia,
  uploadVideoToPinterestS3,
  waitForPinterestMediaReady,
  type PinterestCreatePinPayload,
  type PinterestMediaSource,
} from '../_shared/pinterest-api.ts'
import { notifyPinError } from '../_shared/notifications.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createServiceClient()
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

    // Query pins with metadata_created + scheduled_at in the past + not yet published
    const { data: pins, error: fetchError } = await supabase
      .from('pins')
      .select(
        '*, blog_articles(url), blog_projects(pinterest_connection_id)'
      )
      .eq('status', 'metadata_created')
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', new Date().toISOString())
      .is('pinterest_pin_id', null)

    if (fetchError) {
      throw new Error(`Failed to fetch scheduled pins: ${fetchError.message}`)
    }

    if (!pins || pins.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pins to publish',
          published: 0,
          failed: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Group pins by pinterest_connection_id
    const pinsByConnection = new Map<
      string,
      typeof pins
    >()

    for (const pin of pins) {
      const connectionId = pin.blog_projects?.pinterest_connection_id
      if (!connectionId) {
        // Mark pin as error — no connection
        const noConnectionError =
          'No Pinterest account connected to this project'
        await supabase
          .from('pins')
          .update({
            status: 'error',
            error_message: noConnectionError,
          })
          .eq('id', pin.id)
          .eq('status', 'metadata_created')
        await notifyPinError({
          supabase,
          pinId: pin.id,
          errorMessage: noConnectionError,
        })
        continue
      }

      if (!pinsByConnection.has(connectionId)) {
        pinsByConnection.set(connectionId, [])
      }
      pinsByConnection.get(connectionId)!.push(pin)
    }

    let totalPublished = 0
    let totalFailed = 0
    const results: Array<{
      pin_id: string
      success: boolean
      error?: string
    }> = []

    // Process each connection group
    for (const [connectionId, connectionPins] of pinsByConnection) {
      // Get access token from Vault
      const { data: tokenData, error: tokenError } = await supabase.rpc(
        'get_pinterest_access_token',
        { p_connection_id: connectionId }
      )

      if (tokenError || !tokenData) {
        // Mark all pins for this connection as failed
        const tokenErrorMessage = `Failed to retrieve Pinterest access token: ${tokenError?.message || 'Unknown error'}`
        for (const pin of connectionPins) {
          await supabase
            .from('pins')
            .update({
              status: 'error',
              error_message: tokenErrorMessage,
            })
            .eq('id', pin.id)
            .eq('status', 'metadata_created')

          await notifyPinError({
            supabase,
            pinId: pin.id,
            errorMessage: tokenErrorMessage,
          })

          results.push({
            pin_id: pin.id,
            success: false,
            error: 'Failed to retrieve access token',
          })
          totalFailed++
        }
        continue
      }

      const accessToken = tokenData as string

      // Process each pin sequentially with rate limiting
      for (let i = 0; i < connectionPins.length; i++) {
        const pin = connectionPins[i]

        try {
          const mediaPublicUrl = `${supabaseUrl}/storage/v1/object/public/pin-images/${pin.image_path}`

          let mediaSource: PinterestMediaSource

          if (pin.media_type === 'video') {
            // Step 1: Register a media slot with Pinterest
            const registration = await registerPinterestMedia(accessToken)

            // Step 2: Fetch video bytes from Supabase Storage
            const videoResponse = await fetch(mediaPublicUrl)
            if (!videoResponse.ok) {
              throw new Error(
                `Failed to fetch video from storage: ${videoResponse.status} ${videoResponse.statusText}`
              )
            }
            const videoBytes = new Uint8Array(await videoResponse.arrayBuffer())
            const filename = (pin.image_path as string).split('/').pop() ?? 'video.mp4'

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
              videoSource.cover_image_url = `${supabaseUrl}/storage/v1/object/public/pin-images/${pin.cover_image_path}`
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

          // Atomic update: only update if status is still metadata_created
          await supabase
            .from('pins')
            .update({
              status: 'published',
              published_at: new Date().toISOString(),
              pinterest_pin_id: result.id,
              pinterest_pin_url: `https://www.pinterest.com/pin/${result.id}/`,
            })
            .eq('id', pin.id)
            .eq('status', 'metadata_created')

          results.push({ pin_id: pin.id, success: true })
          totalPublished++
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)

          // Handle 401 — mark connection inactive
          if (errorMessage.includes('401')) {
            await supabase
              .from('pinterest_connections')
              .update({ is_active: false })
              .eq('id', connectionId)
          }

          // Atomic error update: only if status hasn't changed
          await supabase
            .from('pins')
            .update({
              status: 'error',
              error_message: errorMessage,
            })
            .eq('id', pin.id)
            .eq('status', 'metadata_created')

          await notifyPinError({
            supabase,
            pinId: pin.id,
            errorMessage,
          })

          results.push({
            pin_id: pin.id,
            success: false,
            error: errorMessage,
          })
          totalFailed++
        }

        // 10s delay between pins (rate limiting)
        if (i < connectionPins.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 10000))
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: pins.length,
        published: totalPublished,
        failed: totalFailed,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[publish-scheduled-pins] Error:', message)

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
