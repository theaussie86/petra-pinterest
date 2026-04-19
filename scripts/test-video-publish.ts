/**
 * E2E test for the Pinterest video publish flow.
 *
 * Uses the existing video pin on "Online Heldinnen" that previously failed
 * (status=error) because the video flow wasn't wired in yet. Resets it to
 * metadata_created and runs the full publish path:
 *   register media → upload to S3 → poll → POST /pins with video_id
 *
 * Usage:
 *   npx tsx scripts/test-video-publish.ts [--pin-id <uuid>] [--dry-run]
 *
 * Defaults to pin 1432e9ab-8a60-40eb-bf10-de0b23280a0a (Online Heldinnen test video).
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

// --- env ---

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

// --- args ---

const args = process.argv.slice(2)
const pinIdIdx = args.indexOf('--pin-id')
const pinIdArg = pinIdIdx !== -1 ? args[pinIdIdx + 1] : undefined
const DRY_RUN = args.includes('--dry-run')
const TARGET_PIN_ID = pinIdArg ?? '1432e9ab-8a60-40eb-bf10-de0b23280a0a'

const PINTEREST_API = 'https://api.pinterest.com/v5'

// --- Supabase ---

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
})

// --- Pinterest helpers (inline, no TanStack deps) ---

async function pinterestFetch<T>(endpoint: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PINTEREST_API}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.method && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = `Pinterest ${res.status}: ${res.statusText}`
    try { msg = `Pinterest ${res.status}: ${JSON.parse(text).message}` } catch {}
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

async function registerMedia(token: string) {
  return pinterestFetch<{ media_id: string; upload_url: string; upload_parameters: Record<string, string> }>(
    '/media', token, { method: 'POST', body: JSON.stringify({ media_type: 'video' }) }
  )
}

async function uploadToS3(reg: Awaited<ReturnType<typeof registerMedia>>, bytes: Uint8Array, filename: string) {
  const form = new FormData()
  for (const [k, v] of Object.entries(reg.upload_parameters)) form.append(k, v)
  form.append('file', new Blob([bytes], { type: 'video/mp4' }), filename)
  const res = await fetch(reg.upload_url, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`)
}

async function pollMediaReady(token: string, mediaId: string, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs
  const backoff = [5_000, 10_000, 15_000, 30_000]
  let step = 0
  while (true) {
    const s = await pinterestFetch<{ media_id: string; status: string }>(`/media/${mediaId}`, token, { method: 'GET' })
    console.log(`  [poll] status=${s.status}`)
    if (s.status === 'succeeded') return s
    if (s.status === 'failed') throw new Error(`Pinterest media processing failed for ${mediaId}`)
    if (Date.now() >= deadline) throw new Error(`Timeout waiting for media ${mediaId}`)
    const delay = backoff[Math.min(step, backoff.length - 1)]!
    step++
    await new Promise(r => setTimeout(r, delay))
  }
}

// --- main ---

async function main() {
  console.log(`\n=== Pinterest Video Publish E2E Test ===`)
  console.log(`Pin ID   : ${TARGET_PIN_ID}`)
  console.log(`Dry run  : ${DRY_RUN}\n`)

  // 1. Fetch pin
  const { data: pin, error: pinErr } = await supabase
    .from('pins')
    .select('*, blog_articles(url), blog_projects(pinterest_connection_id, name)')
    .eq('id', TARGET_PIN_ID)
    .single()

  if (pinErr || !pin) {
    console.error('Pin not found:', pinErr?.message)
    process.exit(1)
  }

  console.log(`Project  : ${pin.blog_projects?.name}`)
  console.log(`Status   : ${pin.status}`)
  console.log(`media_type: ${pin.media_type}`)
  console.log(`image_path: ${pin.image_path}`)
  console.log(`board_id : ${pin.pinterest_board_id}`)

  if (pin.media_type !== 'video') {
    console.error(`\nExpected media_type=video, got: ${pin.media_type}`)
    process.exit(1)
  }
  if (!pin.image_path) {
    console.error('\nPin has no image_path (video file path).')
    process.exit(1)
  }
  if (!pin.pinterest_board_id) {
    console.error('\nPin has no board assigned.')
    process.exit(1)
  }
  if (!pin.blog_projects?.pinterest_connection_id) {
    console.error('\nNo Pinterest connection on this project.')
    process.exit(1)
  }

  // 2. Reset to metadata_created if currently in error (or keep if already there)
  if (pin.status === 'error') {
    console.log('\nResetting status: error → metadata_created')
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('pins')
        .update({ status: 'metadata_created', error_message: null })
        .eq('id', TARGET_PIN_ID)
      if (error) { console.error('Reset failed:', error.message); process.exit(1) }
    }
  } else if (pin.status !== 'metadata_created') {
    console.error(`\nPin is in status '${pin.status}', can only publish from metadata_created or error.`)
    process.exit(1)
  }

  // 3. Get Pinterest access token from Vault
  console.log('\nFetching Pinterest access token from Vault...')
  const { data: tokenData, error: tokenErr } = await supabase.rpc(
    'get_pinterest_access_token',
    { p_connection_id: pin.blog_projects.pinterest_connection_id }
  )
  if (tokenErr || !tokenData) {
    console.error('Token fetch failed:', tokenErr?.message ?? 'no data')
    process.exit(1)
  }
  const token = tokenData as string
  console.log('Token retrieved (length:', token.length, ')')

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would proceed with video registration + upload. Exiting.')
    process.exit(0)
  }

  // 4. Register media slot with Pinterest
  console.log('\nRegistering media with Pinterest...')
  const registration = await registerMedia(token)
  console.log('media_id:', registration.media_id)

  // 5. Fetch video bytes from Supabase Storage
  const videoUrl = `${SUPABASE_URL}/storage/v1/object/public/pin-images/${pin.image_path}`
  console.log(`\nFetching video from storage: ${videoUrl}`)
  const videoRes = await fetch(videoUrl)
  if (!videoRes.ok) {
    console.error(`Failed to fetch video: ${videoRes.status} ${videoRes.statusText}`)
    process.exit(1)
  }
  const videoBytes = new Uint8Array(await videoRes.arrayBuffer())
  console.log(`Video size: ${(videoBytes.length / 1024 / 1024).toFixed(2)} MB`)

  // 6. Upload to Pinterest S3
  console.log('\nUploading to Pinterest S3...')
  const filename = pin.image_path.split('/').pop() ?? 'video.mp4'
  await uploadToS3(registration, videoBytes, filename)
  console.log('Upload complete.')

  // 7. Poll until ready
  console.log('\nPolling for Pinterest media processing...')
  await pollMediaReady(token, registration.media_id)
  console.log('Media ready!')

  // 8. Build payload
  interface MediaSource {
    source_type: string
    media_id: string
    cover_image_url?: string
    cover_image_key_frame_time?: number
  }

  const mediaSource: MediaSource = {
    source_type: 'video_id',
    media_id: registration.media_id,
  }
  if (pin.cover_image_path) {
    mediaSource.cover_image_url = `${SUPABASE_URL}/storage/v1/object/public/pin-images/${pin.cover_image_path}`
    console.log('Cover: image_url')
  } else {
    mediaSource.cover_image_key_frame_time = pin.cover_keyframe_seconds ?? 1
    console.log(`Cover: keyframe at ${pin.cover_keyframe_seconds ?? 1}s`)
  }

  const payload: Record<string, unknown> = {
    board_id: pin.pinterest_board_id,
    media_source: mediaSource,
  }
  if (pin.title) payload.title = (pin.title as string).substring(0, 100)
  if (pin.description) payload.description = (pin.description as string).substring(0, 800)
  if (pin.alt_text) payload.alt_text = (pin.alt_text as string).substring(0, 500)
  const linkUrl = pin.alternate_url ?? pin.blog_articles?.url
  if (linkUrl) payload.link = linkUrl

  console.log('\nCreating Pinterest pin...')
  const result = await pinterestFetch<{ id: string }>(
    '/pins', token, { method: 'POST', body: JSON.stringify(payload) }
  )
  console.log('Pinterest pin created! ID:', result.id)

  // 9. Update pin record
  await supabase
    .from('pins')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      pinterest_pin_id: result.id,
      pinterest_pin_url: `https://www.pinterest.com/pin/${result.id}/`,
    })
    .eq('id', TARGET_PIN_ID)

  console.log(`\n✓ Pin published successfully!`)
  console.log(`  Pinterest URL: https://www.pinterest.com/pin/${result.id}/`)
  console.log(`  DB status: published`)
}

main().catch(err => {
  console.error('\nFatal error:', err.message ?? err)
  process.exit(1)
})
