import { supabase } from '@/lib/supabase'
import type { PinMetadataGeneration } from '@/types/pins'

/**
 * Get metadata generation history for a pin.
 * Returns up to last 3 generations, ordered by most recent first.
 */
export async function getMetadataHistory(
  pinId: string
): Promise<PinMetadataGeneration[]> {
  const { data, error } = await supabase
    .from('pin_metadata_generations')
    .select('*')
    .eq('pin_id', pinId)
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) throw error
  return data || []
}

/**
 * Restore a previous metadata generation to the pin.
 * Updates the pin's title, description, and alt_text from the selected generation.
 */
export async function restoreMetadataGeneration(
  pinId: string,
  generationId: string
): Promise<void> {
  // Fetch the generation
  const { data: generation, error: fetchError } = await supabase
    .from('pin_metadata_generations')
    .select('*')
    .eq('id', generationId)
    .single()

  if (fetchError || !generation) throw new Error('Generation not found')

  // Update pin with the selected generation's metadata
  const { error: updateError } = await supabase
    .from('pins')
    .update({
      title: generation.title,
      description: generation.description,
      alt_text: generation.alt_text,
    })
    .eq('id', pinId)

  if (updateError) throw updateError
}
