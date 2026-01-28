import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/auth'
import type { Pin, PinInsert, PinUpdate, Board, PinStatus } from '@/types/pins'

export async function getPinsByProject(projectId: string): Promise<Pin[]> {
  const { data, error } = await supabase
    .from('pins')
    .select('*')
    .eq('blog_project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getPin(id: string): Promise<Pin> {
  const { data, error } = await supabase
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

export async function uploadPinImage(
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

export function getPinImageUrl(path: string): string {
  const {
    data: { publicUrl },
  } = supabase.storage.from('pin-images').getPublicUrl(path)
  return publicUrl
}

export async function getBoardsByProject(
  projectId: string
): Promise<Board[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('blog_project_id', projectId)
    .order('name')

  if (error) throw error
  return data
}
