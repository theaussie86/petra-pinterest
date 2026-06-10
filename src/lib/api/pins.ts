import { supabase } from '@/lib/supabase'
import { getSupabaseClient } from '@/lib/supabase-iso'
import { ensureProfile } from '@/lib/auth'
import type { Pin, PinInsert, PinUpdate, PinStatus } from '@/types/pins'

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

export async function getAllPins(): Promise<Pin[]> {
  const { data, error } = await getSupabaseClient()
    .from('pins')
    .select('*')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getPin(id: string): Promise<Pin> {
  const { data, error } = await getSupabaseClient()
    .from('pins')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createPin(pin: PinInsert): Promise<Pin> {
  const { tenant_id } = await ensureProfile()

  const { data, error } = await supabase
    .from('pins')
    .insert({
      ...pin,
      tenant_id,
      // Status defaults to 'draft' in DB. Metadata generation is triggered
      // separately via Trigger.dev after pin creation.
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

export function getPinImageUrl(path: string | null): string {
  if (!path) return ''
  const {
    data: { publicUrl },
  } = supabase.storage.from('pin-images').getPublicUrl(path)
  return publicUrl
}

