import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import { generatePinMetadata } from '../../../src/lib/gemini/client'

export const generateMetadataBulk = inngest.createFunction(
  { id: 'generate-metadata-bulk' },
  { event: 'pin/metadata.bulk-requested' },
  async ({ event, step }) => {
    const { pin_ids, tenant_id } = event.data

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    const results: Array<{ pin_id: string; success: boolean }> = []

    // Process each pin_id sequentially
    for (const pin_id of pin_ids) {
      const result = await step.run(`generate-metadata-${pin_id}`, async () => {
        try {
          // Fetch pin + article
          const { data: pin, error: fetchError } = await supabase
            .from('pins')
            .select('*, blog_articles(title, content)')
            .eq('id', pin_id)
            .single()

          if (fetchError || !pin) {
            throw new Error(`Pin not found: ${pin_id}`)
          }

          // Get pin image URL (construct manually for server-side)
          const imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/pin-images/${pin.image_path}`

          // Call generatePinMetadata
          const metadata = await generatePinMetadata(
            pin.blog_articles.title,
            pin.blog_articles.content,
            imageUrl
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

          // Update pin with metadata + status 'metadaten_erstellt'
          await supabase
            .from('pins')
            .update({
              title: metadata.title,
              description: metadata.description,
              alt_text: metadata.alt_text,
              status: 'metadaten_erstellt',
            })
            .eq('id', pin_id)

          // Prune old generations (keep last 3)
          const { data: generations } = await supabase
            .from('pin_metadata_generations')
            .select('id')
            .eq('pin_id', pin_id)
            .order('created_at', { ascending: false })

          if (generations && generations.length > 3) {
            const idsToKeep = generations.slice(0, 3).map((g) => g.id)
            await supabase
              .from('pin_metadata_generations')
              .delete()
              .eq('pin_id', pin_id)
              .not('id', 'in', `(${idsToKeep.join(',')})`)
          }

          return { pin_id, success: true }
        } catch (error) {
          // On per-pin error: update that pin's status to 'fehler' with error_message, continue to next pin
          await supabase
            .from('pins')
            .update({
              status: 'fehler',
              error_message: String(error),
            })
            .eq('id', pin_id)

          return { pin_id, success: false }
        }
      })

      results.push(result)
    }

    return {
      pins_processed: results.length,
      pins_succeeded: results.filter((r) => r.success).length,
      pins_failed: results.filter((r) => !r.success).length,
    }
  }
)
