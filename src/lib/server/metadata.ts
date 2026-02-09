import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from './supabase'
import { generatePinMetadata, generatePinMetadataWithFeedback } from '@/lib/gemini/client'
import { getPinImageUrl } from '@/lib/api/pins'
import { inngest } from '../../../server/inngest/client'

/**
 * Server function: Generate metadata for a single pin (synchronous).
 * Authenticates via cookies, calls Gemini, stores history, updates pin.
 */
export const generateMetadataFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_id: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    try {
      // Update pin status to 'metadaten_werden_generiert' first
      await supabase
        .from('pins')
        .update({ status: 'metadaten_werden_generiert' })
        .eq('id', data.pin_id)

      // Fetch pin with article data
      const { data: pin, error: fetchError } = await supabase
        .from('pins')
        .select('*, blog_articles(title, content)')
        .eq('id', data.pin_id)
        .single()

      if (fetchError || !pin) throw new Error('Pin not found')

      // Get pin image URL
      const imageUrl = getPinImageUrl(pin.image_path)

      // Call Gemini to generate metadata
      const metadata = await generatePinMetadata(
        pin.blog_articles.title,
        pin.blog_articles.content,
        imageUrl
      )

      // Insert into pin_metadata_generations table
      await supabase.from('pin_metadata_generations').insert({
        pin_id: data.pin_id,
        tenant_id: profile.tenant_id,
        title: metadata.title,
        description: metadata.description,
        alt_text: metadata.alt_text,
        feedback: null,
      })

      // Update pin with metadata and status
      await supabase
        .from('pins')
        .update({
          title: metadata.title,
          description: metadata.description,
          alt_text: metadata.alt_text,
          status: 'metadaten_erstellt',
        })
        .eq('id', data.pin_id)

      // Prune old generations (keep last 3)
      const { data: generations } = await supabase
        .from('pin_metadata_generations')
        .select('id')
        .eq('pin_id', data.pin_id)
        .order('created_at', { ascending: false })

      if (generations && generations.length > 3) {
        const idsToKeep = generations.slice(0, 3).map((g) => g.id)
        await supabase
          .from('pin_metadata_generations')
          .delete()
          .eq('pin_id', data.pin_id)
          .not('id', 'in', `(${idsToKeep.join(',')})`)
      }

      return { success: true, metadata }
    } catch (error) {
      // On error: update pin status to 'fehler', set error_message
      await supabase
        .from('pins')
        .update({
          status: 'fehler',
          error_message: String(error),
        })
        .eq('id', data.pin_id)

      throw error
    }
  })

/**
 * Server function: Generate metadata for a single pin with feedback (synchronous).
 * Uses conversation history to refine based on user feedback.
 */
export const generateMetadataWithFeedbackFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_id: string; feedback: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    try {
      // Update pin status to 'metadaten_werden_generiert' first
      await supabase
        .from('pins')
        .update({ status: 'metadaten_werden_generiert' })
        .eq('id', data.pin_id)

      // Fetch previous generation from pin_metadata_generations (latest for pin_id)
      const { data: previousGeneration } = await supabase
        .from('pin_metadata_generations')
        .select('*')
        .eq('pin_id', data.pin_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!previousGeneration) {
        throw new Error('No previous generation found for feedback')
      }

      // Fetch pin + article data
      const { data: pin, error: fetchError } = await supabase
        .from('pins')
        .select('*, blog_articles(title, content)')
        .eq('id', data.pin_id)
        .single()

      if (fetchError || !pin) throw new Error('Pin not found')

      // Get pin image URL
      const imageUrl = getPinImageUrl(pin.image_path)

      // Call Gemini with feedback (multi-turn conversation)
      const metadata = await generatePinMetadataWithFeedback(
        pin.blog_articles.title,
        pin.blog_articles.content,
        imageUrl,
        {
          title: previousGeneration.title,
          description: previousGeneration.description,
          alt_text: previousGeneration.alt_text,
        },
        data.feedback
      )

      // Store new generation in pin_metadata_generations WITH feedback text
      await supabase.from('pin_metadata_generations').insert({
        pin_id: data.pin_id,
        tenant_id: profile.tenant_id,
        title: metadata.title,
        description: metadata.description,
        alt_text: metadata.alt_text,
        feedback: data.feedback,
      })

      // Update pin with new values, set status to 'metadaten_erstellt'
      await supabase
        .from('pins')
        .update({
          title: metadata.title,
          description: metadata.description,
          alt_text: metadata.alt_text,
          status: 'metadaten_erstellt',
        })
        .eq('id', data.pin_id)

      // Prune old generations (keep last 3)
      const { data: generations } = await supabase
        .from('pin_metadata_generations')
        .select('id')
        .eq('pin_id', data.pin_id)
        .order('created_at', { ascending: false })

      if (generations && generations.length > 3) {
        const idsToKeep = generations.slice(0, 3).map((g) => g.id)
        await supabase
          .from('pin_metadata_generations')
          .delete()
          .eq('pin_id', data.pin_id)
          .not('id', 'in', `(${idsToKeep.join(',')})`)
      }

      return { success: true, metadata }
    } catch (error) {
      // On error: update pin status to 'fehler', set error_message
      await supabase
        .from('pins')
        .update({
          status: 'fehler',
          error_message: String(error),
        })
        .eq('id', data.pin_id)

      throw error
    }
  })

/**
 * Server function: Trigger bulk metadata generation via Inngest (async).
 * Authenticates via cookies, sends Inngest event.
 */
export const triggerBulkMetadataFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_ids: string[] }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Update all selected pins status to 'metadaten_werden_generiert'
    await supabase
      .from('pins')
      .update({ status: 'metadaten_werden_generiert' })
      .in('id', data.pin_ids)

    // Send Inngest event
    await inngest.send({
      name: 'pin/metadata.bulk-requested',
      data: {
        pin_ids: data.pin_ids,
        tenant_id: profile.tenant_id,
      },
    })

    return { success: true, pins_queued: data.pin_ids.length }
  })
