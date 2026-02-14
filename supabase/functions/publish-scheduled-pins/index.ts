import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  createPinterestPin,
  type PinterestCreatePinPayload,
} from '../_shared/pinterest-api.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createServiceClient()
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

    // Query pins that are ready to publish and past their scheduled time
    const { data: pins, error: fetchError } = await supabase
      .from('pins')
      .select(
        '*, blog_articles(url), blog_projects(pinterest_connection_id)'
      )
      .eq('status', 'ready_to_schedule')
      .lte('scheduled_at', new Date().toISOString())

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
        await supabase
          .from('pins')
          .update({
            status: 'error',
            error_message: 'No Pinterest account connected to this project',
          })
          .eq('id', pin.id)
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
        for (const pin of connectionPins) {
          await supabase
            .from('pins')
            .update({
              status: 'error',
              error_message: `Failed to retrieve Pinterest access token: ${tokenError?.message || 'Unknown error'}`,
            })
            .eq('id', pin.id)

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
          // Set status to publishing
          await supabase
            .from('pins')
            .update({ status: 'publish_pin' })
            .eq('id', pin.id)

          // Build image URL
          const imagePublicUrl = `${supabaseUrl}/storage/v1/object/public/pin-images/${pin.image_path}`

          // Build Pinterest API payload
          const payload: PinterestCreatePinPayload = {
            board_id: pin.pinterest_board_id,
            media_source: {
              source_type: 'image_url',
              url: imagePublicUrl,
            },
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
          if (pin.blog_articles?.url) {
            payload.link = pin.blog_articles.url
          }

          // Call Pinterest API
          const result = await createPinterestPin(accessToken, payload)

          // On success: update pin
          await supabase
            .from('pins')
            .update({
              status: 'published',
              published_at: new Date().toISOString(),
              pinterest_pin_id: result.id,
              pinterest_pin_url: `https://www.pinterest.com/pin/${result.id}/`,
            })
            .eq('id', pin.id)

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

          // Mark pin as error
          await supabase
            .from('pins')
            .update({
              status: 'error',
              error_message: errorMessage,
            })
            .eq('id', pin.id)

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
