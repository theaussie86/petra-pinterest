import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

type SupabaseClient = ReturnType<typeof createServiceClient>

const BUCKET = 'pin-images'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const PUBLISHED_LIMIT = 100
const ORPHAN_LIMIT = 100

/**
 * Step 1: delete storage images of pins published 7+ days ago and NULL their
 * image_path. Returns how many were cleaned / failed. Self-contained so a
 * failure here cannot abort the orphan step.
 */
async function cleanupPublishedImages(supabase: SupabaseClient) {
  const { data: pins, error: fetchError } = await supabase
    .from('pins')
    .select('id, image_path')
    .not('pinterest_pin_id', 'is', null)
    .not('image_path', 'is', null)
    .lt('published_at', new Date(Date.now() - SEVEN_DAYS_MS).toISOString())
    .limit(PUBLISHED_LIMIT)

  if (fetchError) {
    console.error('[cleanup-published-images] Fetch error:', fetchError.message)
    return { total: 0, cleaned: 0, failed: 0 }
  }

  if (!pins || pins.length === 0) {
    return { total: 0, cleaned: 0, failed: 0 }
  }

  const imagePaths = pins.map((p) => p.image_path as string)
  const pinIds = pins.map((p) => p.id)

  const { error: storageError } = await supabase.storage.from(BUCKET).remove(imagePaths)

  if (storageError) {
    console.error('[cleanup-published-images] Storage deletion error:', storageError.message)
    return { total: pins.length, cleaned: 0, failed: pins.length }
  }

  const { error: updateError } = await supabase
    .from('pins')
    .update({ image_path: null })
    .in('id', pinIds)

  if (updateError) {
    console.error('[cleanup-published-images] DB update error:', updateError.message)
    return { total: pins.length, cleaned: 0, failed: pins.length }
  }

  return { total: pins.length, cleaned: pins.length, failed: 0 }
}

/**
 * Step 2: remove orphaned uploads in pin-images — objects older than 7 days
 * that no pin references (image_path or cover_image_path). The orphan list
 * comes from the service_role-only RPC list_orphaned_pin_images (#138), since
 * storage.objects is not reachable over PostgREST. Deletion goes through the
 * Storage API, not a SQL DELETE, so the backend files are actually removed.
 */
async function cleanupOrphanedUploads(supabase: SupabaseClient) {
  const { data: names, error: rpcError } = await supabase.rpc('list_orphaned_pin_images', {
    max_count: ORPHAN_LIMIT,
  })

  if (rpcError) {
    console.error('[cleanup-published-images] Orphan lookup error:', rpcError.message)
    return { orphans_cleaned: 0, orphans_failed: 0 }
  }

  const orphanPaths = (names ?? []) as string[]
  if (orphanPaths.length === 0) {
    return { orphans_cleaned: 0, orphans_failed: 0 }
  }

  const { error: storageError } = await supabase.storage.from(BUCKET).remove(orphanPaths)

  if (storageError) {
    console.error('[cleanup-published-images] Orphan deletion error:', storageError.message)
    return { orphans_cleaned: 0, orphans_failed: orphanPaths.length }
  }

  return { orphans_cleaned: orphanPaths.length, orphans_failed: 0 }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createServiceClient()

    // Both steps run independently: a failure in one must not block the other.
    const published = await cleanupPublishedImages(supabase)
    const orphans = await cleanupOrphanedUploads(supabase)

    return new Response(
      JSON.stringify({
        success: true,
        total: published.total,
        cleaned: published.cleaned,
        failed: published.failed,
        orphans_cleaned: orphans.orphans_cleaned,
        orphans_failed: orphans.orphans_failed,
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
