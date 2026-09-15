// Pin metadata pipeline shared by the synchronous single-pin function and the
// generate_metadata queue worker (ADR-0004). Throws on any failure; callers
// decide what an error means for the pin's status.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  generatePinMetadata,
  fetchImageBytes,
  sanitizeLanguage,
  buildPinterestSeoSystemPrompt,
  type ImageBytes,
} from './ai.ts'
import { extractKeyframe } from './ffmpeg-client.ts'

export interface PinMetadataJob {
  pin_id: string
  tenant_id: string
}

export interface PinMetadata {
  title: string
  description: string
  alt_text: string
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm']
const GENERATIONS_TO_KEEP = 3

export async function generateAndStorePinMetadata(
  supabase: SupabaseClient,
  { pin_id, tenant_id }: PinMetadataJob,
): Promise<PinMetadata> {
  // Fetch pin with article data (article may be null)
  const { data: pin, error: fetchError } = await supabase
    .from('pins')
    .select('*, blog_articles(title, content)')
    .eq('id', pin_id)
    .single()

  if (fetchError || !pin) {
    throw new Error(`Pin not found: ${pin_id}`)
  }

  if (!pin.image_path) {
    throw new Error(`Pin ${pin_id} has no image`)
  }

  const projectId = pin.blog_project_id

  // Fetch project settings for language and AI context
  const { data: projectData } = await supabase
    .from('blog_projects')
    .select('language, ai_context')
    .eq('id', projectId)
    .single()
  const language = sanitizeLanguage(projectData?.language)
  const systemPrompt = buildPinterestSeoSystemPrompt(language, projectData?.ai_context)

  const { data: apiKey, error: vaultError } = await supabase.rpc(
    'get_gemini_api_key',
    { p_blog_project_id: projectId },
  )

  if (vaultError || !apiKey) {
    throw new Error(
      `Failed to retrieve Gemini API key: ${vaultError?.message || 'No key configured'}`,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const imageUrl = `${supabaseUrl}/storage/v1/object/public/pin-images/${pin.image_path}`

  const ext = pin.image_path.split('.').pop()?.toLowerCase() ?? ''
  const mediaType = VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'image'

  // Fetch the image bytes ourselves so private/signed URLs stay reachable.
  // For video pins: extract a keyframe and pass its bytes through the same part.
  let image: ImageBytes
  if (mediaType === 'video') {
    const keyframe = await extractKeyframe(imageUrl, { second: pin.cover_keyframe_seconds ?? 1 })
    image = { bytes: keyframe.bytes, mimeType: keyframe.contentType }
  } else {
    image = await fetchImageBytes(imageUrl)
  }

  const metadata = await generatePinMetadata({
    article: { title: pin.blog_articles?.title, content: pin.blog_articles?.content },
    image,
    mediaType,
    systemPrompt,
    apiKey,
  })

  await supabase.from('pin_metadata_generations').insert({
    pin_id,
    tenant_id,
    title: metadata.title,
    description: metadata.description,
    alt_text: metadata.alt_text,
    feedback: null,
  })

  await supabase
    .from('pins')
    .update({
      title: metadata.title,
      description: metadata.description,
      alt_text: metadata.alt_text,
      status: 'metadata_created',
    })
    .eq('id', pin_id)

  // Prune old generations
  const { data: generations } = await supabase
    .from('pin_metadata_generations')
    .select('id')
    .eq('pin_id', pin_id)
    .order('created_at', { ascending: false })

  if (generations && generations.length > GENERATIONS_TO_KEEP) {
    const idsToKeep = generations.slice(0, GENERATIONS_TO_KEEP).map((g: { id: string }) => g.id)
    await supabase
      .from('pin_metadata_generations')
      .delete()
      .eq('pin_id', pin_id)
      .not('id', 'in', `(${idsToKeep.join(',')})`)
  }

  return metadata
}
