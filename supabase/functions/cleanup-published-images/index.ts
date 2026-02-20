import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createServiceClient()

    // Query published pins with images older than 7 days, limit 100 per run
    const { data: pins, error: fetchError } = await supabase
      .from('pins')
      .select('id, image_path')
      .not('pinterest_pin_id', 'is', null)
      .not('image_path', 'is', null)
      .lt('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100)

    if (fetchError) {
      throw new Error(`Failed to fetch pins for cleanup: ${fetchError.message}`)
    }

    if (!pins || pins.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No images to clean up',
          cleaned: 0,
          failed: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const imagePaths = pins.map((p) => p.image_path as string)
    const pinIds = pins.map((p) => p.id)

    let cleaned = 0
    let failed = 0

    // Batch-delete from Storage
    const { error: storageError } = await supabase.storage
      .from('pin-images')
      .remove(imagePaths)

    if (storageError) {
      console.error('[cleanup-published-images] Storage deletion error:', storageError.message)
      failed = pins.length
    } else {
      // Mark image_path as NULL on successfully cleaned pins
      const { error: updateError } = await supabase
        .from('pins')
        .update({ image_path: null })
        .in('id', pinIds)

      if (updateError) {
        console.error('[cleanup-published-images] DB update error:', updateError.message)
        failed = pins.length
      } else {
        cleaned = pins.length
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: pins.length,
        cleaned,
        failed,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cleanup-published-images] Error:', message)

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
