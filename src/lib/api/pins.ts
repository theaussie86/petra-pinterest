import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getSupabaseClient } from '@/lib/supabase-iso'
import { ensureProfile } from '@/lib/auth'
import { syncPublishJobsFn } from '@/lib/server/publish-sync'
import type { Pin, PinInsert, PinUpdate, PinStatus } from '@/types/pins'

/**
 * Reconcile the MQ publish jobs for the pins a write just touched (issue #104).
 * Runs server-side via `syncPublishJobsFn`, which (re)enqueues or cancels each
 * pin's delayed publish job to match its current eligibility. Best-effort: an
 * MQ or server hiccup must never break the originating mutation, so failures
 * are swallowed here — the MQ reconcile job (MQ #14) catches anything dropped.
 */
async function syncPublishJobsSafe(pinIds: string[]): Promise<void> {
  if (pinIds.length === 0) return
  try {
    await syncPublishJobsFn({ data: { pinIds } })
  } catch (err) {
    console.error('[pins] syncPublishJobs failed', err)
  }
}

export interface PaginatedPinsResult {
  pins: Pin[]
  nextCursor: string | null
}

export interface GetPinsPaginatedOptions {
  createdAfter?: Date
  cursor?: string
  limit?: number
  statusFilter?: string[]
}

export async function getPinsPaginated(
  projectId: string,
  options: GetPinsPaginatedOptions = {}
): Promise<PaginatedPinsResult> {
  const { createdAfter, cursor, limit = 20, statusFilter } = options

  const client = getSupabaseClient()

  // Build a `created_at`-descending page bounded by an optional lower (`gte`,
  // the recent-days window) and/or upper (`lt`, the cursor) `created_at` bound.
  // Fetches one extra row so the caller can tell whether more pages follow.
  const fetchPage = async (
    bounds: { gte?: string; lt?: string },
    take: number,
  ): Promise<Pin[]> => {
    let query = client.from('pins').select('*').eq('blog_project_id', projectId)

    if (bounds.gte) query = query.gte('created_at', bounds.gte)
    if (bounds.lt) query = query.lt('created_at', bounds.lt)
    if (statusFilter && statusFilter.length > 0) query = query.in('status', statusFilter)

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(take)

    if (error) throw error
    return data
  }

  // The primary page: the recent-days window on first load (`createdAfter`), or
  // a cursor page (`cursor`) once the user pages back.
  let rows = await fetchPage(
    { gte: createdAfter?.toISOString(), lt: cursor },
    limit + 1,
  )

  // When the recent-days window underfills the page, backfill with pins older
  // than the window so every pin in the project stays reachable. Without this a
  // legacy project whose pins all predate the window would surface an empty or
  // near-empty first page with no way to reach the rest (issue #66).
  if (createdAfter && rows.length <= limit) {
    const older = await fetchPage(
      { lt: createdAfter.toISOString() },
      limit + 1 - rows.length,
    )
    rows = [...rows, ...older]
  }

  const hasMore = rows.length > limit
  const pins = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? pins[pins.length - 1].created_at : null

  return { pins, nextCursor }
}

/**
 * Per-status pin totals keyed by `PinStatus`, for one project or — when
 * `projectId` is omitted — account-wide (the MCP `get_pin_status_counts` tool).
 * Powers the status filter-tab badges (issue #67): a lightweight `status`-only
 * read that counts the full pin set regardless of how many pages the paginated
 * list has loaded, so the badges show true totals (e.g. "Alle 100") rather than
 * just the loaded rows. Runs through the isomorphic client so it respects tenant
 * RLS under the SSR-auth read pattern (ADR 0003).
 */
export async function getPinStatusCounts(
  projectId?: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<Record<string, number>> {
  let query = client.from('pins').select('status')
  if (projectId) query = query.eq('blog_project_id', projectId)

  const { data, error } = await query

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of data as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}

/**
 * Read the current status of a specific set of pins (issue #89). Used to poll
 * bulk-metadata progress from the database. Runs through the isomorphic (RLS)
 * client, so only pins in the caller's tenant come back.
 */
export async function getPinStatusesById(
  ids: string[]
): Promise<{ id: string; status: PinStatus }[]> {
  if (ids.length === 0) return []

  const { data, error } = await getSupabaseClient()
    .from('pins')
    .select('id, status')
    .in('id', ids)

  if (error) throw error
  return data as { id: string; status: PinStatus }[]
}

export async function getPinsByProject(projectId: string): Promise<Pin[]> {
  const { data, error } = await getSupabaseClient()
    .from('pins')
    .select('*')
    .eq('blog_project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getPinsByArticle(articleId: string): Promise<Pin[]> {
  const { data, error } = await getSupabaseClient()
    .from('pins')
    .select('*')
    .eq('blog_article_id', articleId)
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getPin(
  id: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<Pin> {
  const { data, error } = await client
    .from('pins')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export interface ListPinsOptions {
  /** Restrict to one project. Omit for every project the caller can see. */
  projectId?: string
  /** Restrict to these pin statuses. */
  status?: string[]
  /** Lower bound on `scheduled_at` (inclusive), ISO string. */
  scheduledFrom?: string
  /** Upper bound on `scheduled_at` (inclusive), ISO string. */
  scheduledTo?: string
  limit?: number
}

export interface ListPinsResult {
  pins: Pin[]
  hasMore: boolean
}

/**
 * Filtered pin list shared by the UI and the MCP server (Spec #115, user story
 * 22: "Was geht nächste Woche raus?"). Filters by project, status set and a
 * `scheduled_at` range; capped by `limit`. Takes an optional Supabase client so
 * a Connected Agent's token-bound client runs the same query under RLS.
 */
export async function listPins(
  options: ListPinsOptions = {},
  client: SupabaseClient = getSupabaseClient()
): Promise<ListPinsResult> {
  const { projectId, status, scheduledFrom, scheduledTo, limit = 20 } = options

  let query = client.from('pins').select('*')

  if (projectId) query = query.eq('blog_project_id', projectId)
  if (status && status.length > 0) query = query.in('status', status)
  if (scheduledFrom) query = query.gte('scheduled_at', scheduledFrom)
  if (scheduledTo) query = query.lte('scheduled_at', scheduledTo)

  // Fetch limit + 1 to tell whether a further page follows.
  const { data, error } = await query
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (error) throw error

  const rows = (data as Pin[] | null) ?? []
  const hasMore = rows.length > limit
  const pins = hasMore ? rows.slice(0, limit) : rows

  return { pins, hasMore }
}

export async function createPin(pin: PinInsert): Promise<Pin> {
  const { tenant_id } = await ensureProfile()

  const { data, error } = await supabase
    .from('pins')
    .insert({
      ...pin,
      tenant_id,
      // Status defaults to 'draft' in DB. Metadata generation is enqueued
      // separately on the generate_metadata queue after pin creation.
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createPins(pins: PinInsert[]): Promise<Pin[]> {
  const { tenant_id } = await ensureProfile()

  const { data, error } = await supabase
    .from('pins')
    .insert(pins.map((pin) => ({ ...pin, tenant_id })))
    .select()

  if (error) throw error
  return data
}

export async function updatePin({ id, ...updates }: PinUpdate): Promise<Pin> {
  const { data, error } = await supabase
    .from('pins')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  await syncPublishJobsSafe([id])
  return data
}

export async function deletePin(id: string): Promise<void> {
  // Get image_path before deleting pin row
  const { data: pin, error: fetchError } = await supabase
    .from('pins')
    .select('image_path')
    .eq('id', id)
    .single()

  if (fetchError) throw fetchError

  // Remove image from Storage
  if (pin.image_path) {
    await supabase.storage.from('pin-images').remove([pin.image_path])
  }

  // Delete pin row
  const { error } = await supabase.from('pins').delete().eq('id', id)

  if (error) throw error
  await syncPublishJobsSafe([id])
}

export async function deletePins(ids: string[]): Promise<void> {
  // Get image paths before deleting
  const { data: pins, error: fetchError } = await supabase
    .from('pins')
    .select('image_path')
    .in('id', ids)

  if (fetchError) throw fetchError

  // Remove images from Storage
  const paths = pins
    .map((p) => p.image_path)
    .filter((path): path is string => !!path)
  if (paths.length > 0) {
    await supabase.storage.from('pin-images').remove(paths)
  }

  // Delete pin rows
  const { error } = await supabase.from('pins').delete().in('id', ids)

  if (error) throw error
  await syncPublishJobsSafe(ids)
}

export async function updatePinStatus(
  id: string,
  status: PinStatus
): Promise<Pin> {
  const { data, error } = await supabase
    .from('pins')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  await syncPublishJobsSafe([id])
  return data
}

export async function updatePinsStatus(
  ids: string[],
  status: PinStatus
): Promise<void> {
  const { error } = await supabase
    .from('pins')
    .update({ status })
    .in('id', ids)

  if (error) throw error
  await syncPublishJobsSafe(ids)
}

export async function uploadPinMedia(
  file: File,
  tenantId: string
): Promise<string> {
  const extension = file.name.split('.').pop() || 'png'
  const path = `${tenantId}/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage
    .from('pin-images')
    .upload(path, file)

  if (error) throw error
  return path
}

/**
 * File extension for a storage object, derived from an image MIME type. Mirrors
 * what a browser upload would carry (`uploadPinMedia` keeps the file's own
 * extension); the MCP `create_pin` path has only the server-reported content
 * type to go on. Falls back to a sensible default for unmapped image types.
 */
const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export function imageExtensionFor(contentType: string): string {
  return IMAGE_EXTENSION_BY_TYPE[baseMimeType(contentType)] ?? 'jpg'
}

/** A MIME type without parameters, lowercased (`Image/PNG; q=1` -> `image/png`). */
export function baseMimeType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase()
}

/** The image MIME types `imageExtensionFor` maps, i.e. the supported image types. */
export const SUPPORTED_IMAGE_TYPES = Object.keys(IMAGE_EXTENSION_BY_TYPE).filter(
  (type) => type !== 'image/jpg'
)

/**
 * Upload raw image bytes to the pin-images bucket under the tenant folder,
 * exactly where a UI upload lands (`{tenant_id}/{uuid}.{ext}`), and return the
 * storage path. Used by the MCP `create_pin` tool, which fetches an image from a
 * URL rather than a file. Takes the client so it runs under the caller's RLS
 * session (a Connected Agent's user-token client).
 */
export async function uploadPinImageBytes(
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  tenantId: string,
  client: SupabaseClient
): Promise<string> {
  const path = `${tenantId}/${crypto.randomUUID()}.${imageExtensionFor(contentType)}`

  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const { error } = await client.storage
    .from('pin-images')
    .upload(path, body, { contentType })

  if (error) throw error
  return path
}

/** Whether `imageExtensionFor` maps this MIME type (i.e. a known image type). */
export function isSupportedImageType(contentType: string): boolean {
  return baseMimeType(contentType) in IMAGE_EXTENSION_BY_TYPE
}

/** The image kinds whose magic bytes {@link detectImageKind} recognises. */
type ImageSignatureKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'avif'

/** Maps a supported image MIME type to the kind its magic bytes must identify. */
const IMAGE_KIND_BY_TYPE: Record<string, ImageSignatureKind> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/** Read `length` bytes starting at `offset` as a Latin-1 string (for ASCII tags). */
function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let s = ''
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i])
  return s
}

/**
 * Identify an image from the first bytes of its content (the "magic bytes"),
 * independent of any declared content type. Returns the image kind, or null when
 * the leading bytes match none of the supported signatures (issue #137).
 */
export function detectImageKind(bytes: Uint8Array): ImageSignatureKind | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  )
    return 'png'
  if (b.length >= 6 && (asciiAt(b, 0, 6) === 'GIF87a' || asciiAt(b, 0, 6) === 'GIF89a')) return 'gif'
  if (b.length >= 12 && asciiAt(b, 0, 4) === 'RIFF' && asciiAt(b, 8, 4) === 'WEBP') return 'webp'
  if (
    b.length >= 12 &&
    asciiAt(b, 4, 4) === 'ftyp' &&
    (asciiAt(b, 8, 4) === 'avif' || asciiAt(b, 8, 4) === 'avis')
  )
    return 'avif'
  return null
}

/**
 * The MIME type of an image identified purely by its magic bytes, or null when
 * the content is no supported image. For sources without a trustworthy declared
 * type (base64 from an agent, ChatGPT file downloads served as octet-stream).
 */
export function detectImageType(bytes: Uint8Array): string | null {
  const kind = detectImageKind(bytes)
  return kind ? `image/${kind}` : null
}

/**
 * Whether the leading bytes of an object match its declared image content type.
 * Guards against a falsely declared object — e.g. an HTML file served as
 * `image/png` (issue #137): the content type must name a supported image and
 * the magic bytes must identify that same kind. Unsupported or unrecognised
 * content returns false.
 */
export function imageBytesMatchType(bytes: Uint8Array, contentType: string): boolean {
  const kind = IMAGE_KIND_BY_TYPE[baseMimeType(contentType)]
  if (!kind) return false
  return detectImageKind(bytes) === kind
}

/** A signed upload slot in the pin-images bucket (see `createPinImageUploadUrl`). */
export interface PinImageUploadSlot {
  /** Absolute URL the bytes are PUT to; carries its own upload token. */
  signedUrl: string
  /** Storage path the object lands at (`{tenant_id}/{uuid}.{ext}`). */
  path: string
}

/**
 * Reserve a fresh path in the tenant folder of the pin-images bucket and return
 * a signed upload URL for it. Used by the MCP `request_pin_upload` tool so a
 * Connected Agent can PUT the bytes itself. Runs under the caller's RLS session:
 * the INSERT policy on the tenant folder gates the signing.
 */
export async function createPinImageUploadUrl(
  contentType: string,
  tenantId: string,
  client: SupabaseClient
): Promise<PinImageUploadSlot> {
  const path = `${tenantId}/${crypto.randomUUID()}.${imageExtensionFor(contentType)}`
  const { data, error } = await client.storage
    .from('pin-images')
    .createSignedUploadUrl(path)
  if (error) throw error
  return { signedUrl: data.signedUrl, path: data.path }
}

/** Storage metadata of an object in the pin-images bucket. */
export interface PinImageInfo {
  contentType: string | null
  size: number | null
}

/** Whether a Supabase storage error means the object does not exist (404). */
function isStorageNotFound(error: { status?: number; statusCode?: string; message: string }): boolean {
  return error.status === 404 || error.statusCode === '404' || /not.?found/i.test(error.message)
}

/**
 * Look up a pin-images object's stored content type and size, or null when no
 * object exists at the path. Any other storage error is thrown.
 */
export async function getPinImageInfo(
  path: string,
  client: SupabaseClient
): Promise<PinImageInfo | null> {
  const { data, error } = await client.storage.from('pin-images').info(path)
  if (error) {
    if (isStorageNotFound(error)) return null
    throw error
  }
  return { contentType: data.contentType ?? null, size: data.size ?? null }
}

/**
 * Download a pin-images object's bytes so its real type can be sniffed from the
 * magic bytes (issue #137). Returns null when no object exists at the path; any
 * other storage error is thrown. Callers cap the object size before calling.
 */
export async function downloadPinImageBytes(
  path: string,
  client: SupabaseClient
): Promise<Uint8Array | null> {
  const { data, error } = await client.storage.from('pin-images').download(path)
  if (error) {
    if (isStorageNotFound(error)) return null
    throw error
  }
  return new Uint8Array(await data.arrayBuffer())
}

/** Delete an object from the pin-images bucket (best-effort, errors ignored). */
export async function removePinImage(path: string, client: SupabaseClient): Promise<void> {
  await client.storage.from('pin-images').remove([path])
}

/** Whether any pin (visible to the caller) already references this image path. */
export async function isPinImagePathUsed(
  path: string,
  client: SupabaseClient
): Promise<boolean> {
  const { data, error } = await client
    .from('pins')
    .select('id')
    .eq('image_path', path)
    .limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

/** Provenance stamped on every pin a Connected Agent writes (ADR-0006). */
export interface PinProvenance {
  source: 'mcp'
  oauth_client_id: string | null
}

/** Fields a Connected Agent may set when creating a pin via MCP. */
export interface AgentPinInsert extends PinProvenance {
  tenant_id: string
  blog_project_id: string
  blog_article_id?: string | null
  image_path: string
  media_type?: 'image' | 'video'
  pinterest_board_id?: string | null
  pinterest_board_name?: string | null
  title?: string | null
  description?: string | null
  alt_text?: string | null
  alternate_url?: string | null
  ai_modified?: boolean
  synthetic_performer?: boolean
  status?: PinStatus
}

/**
 * Thrown by {@link insertAgentPin} when the insert hits the partial unique index
 * on an image path (Postgres 23505) — another pin already owns the storage
 * object. The pre-insert `isPinImagePathUsed` check gives the fast, friendly
 * answer; this is the race-proof backstop for two concurrent `create_pin` calls
 * passing the same `upload_path` (issue #137).
 */
export class PinImagePathConflictError extends Error {
  constructor() {
    super('image path is already used by another pin')
    this.name = 'PinImagePathConflictError'
  }
}

/**
 * Insert a pin on behalf of a Connected Agent (MCP). Unlike {@link createPin} it
 * takes an explicit client, tenant and provenance, and never enqueues Gemini
 * metadata generation — writing over MCP is deliberately Gemini-free (ADR-0006).
 * A unique-violation on an image path surfaces as {@link PinImagePathConflictError}.
 */
export async function insertAgentPin(
  pin: AgentPinInsert,
  client: SupabaseClient
): Promise<Pin> {
  const { data, error } = await client.from('pins').insert(pin).select().single()
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505' && /image_path/.test(error.message ?? '')) {
      throw new PinImagePathConflictError()
    }
    throw error
  }
  return data
}

/** Fields a Connected Agent may change on an existing pin via MCP. */
export type AgentPinUpdate = Omit<PinUpdate, 'id'> & PinProvenance

/**
 * Update a pin on behalf of a Connected Agent (MCP). Stamps provenance so the
 * user can see an agent touched it. Does not reconcile the MQ publish job:
 * callers that change scheduling (the schedule tools, #123) do that separately
 * via `syncPublishJobs` (ADR-0005).
 */
export async function updateAgentPin(
  id: string,
  updates: AgentPinUpdate,
  client: SupabaseClient
): Promise<Pin> {
  const { data, error } = await client
    .from('pins')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export function getPinImageUrl(path: string | null): string {
  if (!path) return ''
  const {
    data: { publicUrl },
  } = supabase.storage.from('pin-images').getPublicUrl(path)
  return publicUrl
}

