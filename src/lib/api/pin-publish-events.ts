import { supabase } from '@/lib/supabase'
import type { PinPublishEvent } from '@/types/pins'

/**
 * Get the publish event history for a pin, newest first.
 * Rows are written by the MQ worker; the app only reads them (RLS scopes the
 * rows to the caller's tenant via blog_project_id).
 */
export async function getPinPublishEvents(
  pinId: string
): Promise<PinPublishEvent[]> {
  const { data, error } = await supabase
    .from('pin_publish_events')
    .select('*')
    .eq('pin_id', pinId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as PinPublishEvent[] | null) || []
}
