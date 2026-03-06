import { task } from '@trigger.dev/sdk/v3'
import { createClient } from '@supabase/supabase-js'
import { generatePinMetadata } from '@/lib/gemini/client'
import { sanitizeLanguage } from '@/lib/gemini/language'
import { buildPinterestSeoSystemPrompt } from '@/lib/gemini/prompts'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!

function getPinImageUrl(imagePath: string): string {
  return `${supabaseUrl}/storage/v1/object/public/pin-images/${imagePath}`
}

export interface GenerateMetadataPayload {
  pin_id: string
  tenant_id: string
}

export const generateMetadataTask = task({
  id: 'generate-metadata',
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: GenerateMetadataPayload) => {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    try {
      // Update pin status to 'generating_metadata'
      await supabase
        .from('pins')
        .update({ status: 'generating_metadata' })
        .eq('id', payload.pin_id)

      // Fetch pin with article data
      const { data: pin, error: fetchError } = await supabase
        .from('pins')
        .select('*, blog_articles(title, content)')
        .eq('id', payload.pin_id)
        .single()

      if (fetchError || !pin) {
        throw new Error(`Pin not found: ${payload.pin_id}`)
      }

      if (!pin.image_path) {
        throw new Error(`Pin ${payload.pin_id} has no image`)
      }

      // Get Gemini API key from Vault
      const { data: apiKey, error: vaultError } = await supabase.rpc(
        'get_gemini_api_key',
        { p_blog_project_id: pin.blog_project_id }
      )

      if (vaultError || !apiKey) {
        throw new Error(
          `Failed to retrieve Gemini API key: ${vaultError?.message || 'No key configured'}`
        )
      }

      // Fetch project settings
      const { data: project } = await supabase
        .from('blog_projects')
        .select('language, ai_context')
        .eq('id', pin.blog_project_id)
        .single()

      const language = sanitizeLanguage(project?.language)
      const systemPrompt = buildPinterestSeoSystemPrompt(language, project?.ai_context)

      // Get image URL and media type
      const imageUrl = getPinImageUrl(pin.image_path)
      const ext = pin.image_path.split('.').pop()?.toLowerCase() ?? ''
      const mediaType = ['mp4', 'mov', 'avi', 'webm'].includes(ext) ? 'video' : 'image'

      // Generate metadata with Gemini
      const metadata = await generatePinMetadata(
        pin.blog_articles?.title ?? null,
        pin.blog_articles?.content ?? null,
        imageUrl,
        systemPrompt,
        apiKey,
        mediaType
      )

      // Insert generation history
      await supabase.from('pin_metadata_generations').insert({
        pin_id: payload.pin_id,
        tenant_id: payload.tenant_id,
        title: metadata.title,
        description: metadata.description,
        alt_text: metadata.alt_text,
        feedback: null,
      })

      // Update pin with metadata
      await supabase
        .from('pins')
        .update({
          title: metadata.title,
          description: metadata.description,
          alt_text: metadata.alt_text,
          status: 'metadata_created',
        })
        .eq('id', payload.pin_id)

      // Prune old generations (keep last 3)
      const { data: generations } = await supabase
        .from('pin_metadata_generations')
        .select('id')
        .eq('pin_id', payload.pin_id)
        .order('created_at', { ascending: false })

      if (generations && generations.length > 3) {
        const idsToKeep = generations.slice(0, 3).map((g) => g.id)
        await supabase
          .from('pin_metadata_generations')
          .delete()
          .eq('pin_id', payload.pin_id)
          .not('id', 'in', `(${idsToKeep.join(',')})`)
      }

      return { success: true, pin_id: payload.pin_id, metadata }
    } catch (error) {
      // Update pin with error status before re-throwing for retry
      await supabase
        .from('pins')
        .update({
          status: 'error',
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq('id', payload.pin_id)

      throw error
    }
  },
})
