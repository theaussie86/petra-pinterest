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
  const base = contentType.split(';')[0].trim().toLowerCase()
  return IMAGE_EXTENSION_BY_TYPE[base] ?? 'jpg'
}

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
 * Insert a pin on behalf of a Connected Agent (MCP). Unlike {@link createPin} it
 * takes an explicit client, tenant and provenance, and never enqueues Gemini
 * metadata generation — writing over MCP is deliberately Gemini-free (ADR-0006).
 */
export async function insertAgentPin(
  pin: AgentPinInsert,
  client: SupabaseClient
): Promise<Pin> {
  const { data, error } = await client.from('pins').insert(pin).select().single()
  if (error) throw error
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

