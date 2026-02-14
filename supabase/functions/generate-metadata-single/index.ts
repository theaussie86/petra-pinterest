import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { generatePinMetadata } from '../_shared/gemini.ts'

interface MetadataRequest {
  pin_id: string
  tenant_id: string
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  let pin_id: string | undefined

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

    const supabase = createServiceClient()

    // Fetch pin with article data
    const { data: pin, error: fetchError } = await supabase
      .from('pins')
      .select('*, blog_articles(title, content, blog_project_id)')
      .eq('id', pin_id)
      .single()

    if (fetchError || !pin) {
      throw new Error(`Pin not found: ${pin_id}`)
    }

    if (!pin.blog_articles) {
      throw new Error(`Pin ${pin_id} has no linked article`)
    }

    if (!pin.image_path) {
      throw new Error(`Pin ${pin_id} has no image`)
    }

    // Get Gemini API key from Vault
    const projectId = pin.blog_articles.blog_project_id
    const { data: apiKey, error: vaultError } = await supabase.rpc(
      'get_gemini_api_key',
      { p_blog_project_id: projectId }
    )

    if (vaultError || !apiKey) {
      throw new Error(
        `Failed to retrieve Gemini API key: ${vaultError?.message || 'No key configured'}`
      )
    }

    // Construct public image URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const imageUrl = `${supabaseUrl}/storage/v1/object/public/pin-images/${pin.image_path}`

    // Generate metadata with Gemini
    const metadata = await generatePinMetadata(
      pin.blog_articles.title,
      pin.blog_articles.content,
      imageUrl,
      undefined,
      apiKey
    )

    // Insert generation history
    await supabase.from('pin_metadata_generations').insert({
      pin_id,
      tenant_id,
      title: metadata.title,
      description: metadata.description,
      alt_text: metadata.alt_text,
      feedback: null,
    })

    // Update pin with metadata + status
    await supabase
      .from('pins')
      .update({
        title: metadata.title,
        description: metadata.description,
        alt_text: metadata.alt_text,
        status: 'metadata_created',
      })
      .eq('id', pin_id)

    // Prune old generations (keep last 3)
    const { data: generations } = await supabase
      .from('pin_metadata_generations')
      .select('id')
      .eq('pin_id', pin_id)
      .order('created_at', { ascending: false })

    if (generations && generations.length > 3) {
      const idsToKeep = generations.slice(0, 3).map((g: { id: string }) => g.id)
      await supabase
        .from('pin_metadata_generations')
        .delete()
        .eq('pin_id', pin_id)
        .not('id', 'in', `(${idsToKeep.join(',')})`)
    }

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

    // Try to set pin status to error
    if (pin_id) {
      try {
        const supabase = createServiceClient()
        await supabase
          .from('pins')
          .update({
            status: 'error',
            error_message: message,
          })
          .eq('id', pin_id)
      } catch {
        // Best-effort error status update
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
