import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { generateAndStorePinMetadata } from '../_shared/pin-metadata.ts'

interface MetadataRequest {
  pin_id: string
  tenant_id: string
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  let pin_id: string | undefined

  const supabase = createServiceClient()

  try {
    const body = (await req.json()) as MetadataRequest
    pin_id = body.pin_id
    const tenant_id = body.tenant_id

    if (!pin_id || !tenant_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'pin_id and tenant_id are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const metadata = await generateAndStorePinMetadata(supabase, { pin_id, tenant_id })

    return new Response(
      JSON.stringify({
        success: true,
        pin_id,
        metadata,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[generate-metadata-single] Error:', message)

    if (pin_id) {
      const { error: updateError } = await supabase
        .from('pins')
        .update({ status: 'error', error_message: message })
        .eq('id', pin_id)
      if (updateError) {
        console.error(
          '[generate-metadata-single] Failed to set error status:',
          updateError.message
        )
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
