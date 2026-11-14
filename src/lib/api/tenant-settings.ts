import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getSupabaseClient } from '@/lib/supabase-iso'
import { ensureProfile } from '@/lib/auth'
import { readAiMetadataEnabled } from '@/lib/ai-metadata-setting'

/**
 * Read the caller's "KI-Metadaten automatisch erzeugen" setting (ADR-0009).
 * RLS scopes the read to the caller's tenant. No row or no table yet = on.
 */
export async function getAiMetadataEnabled(
  client: SupabaseClient = getSupabaseClient(),
): Promise<boolean> {
  return readAiMetadataEnabled(client)
}

/**
 * Switch AI metadata generation on or off for the caller's tenant. Upserts the
 * tenant's settings row through the browser client (RLS checks the tenant).
 */
export async function setAiMetadataEnabled(enabled: boolean): Promise<void> {
  const { tenant_id } = await ensureProfile()
  const { error } = await supabase
    .from('tenant_settings')
    .upsert({ tenant_id, ai_metadata_enabled: enabled }, { onConflict: 'tenant_id' })
  if (error) throw error
}
