import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Account setting "KI-Metadaten automatisch erzeugen (Gemini)", stored per
 * tenant in `public.tenant_settings.ai_metadata_enabled` (migration
 * 00042_tenant_settings.sql, ADR-0009). Unlike `tenant_features`, the user
 * switches it himself.
 *
 * Default is on: no row means on, and so does a missing table, so this code is
 * safe to deploy before the migration has run.
 */

/** Error text shared by the DB (enqueue_generate_metadata), server and UI. */
export const AI_METADATA_DISABLED_MESSAGE = 'AI metadata generation is disabled for this account'

/** True when an error (or its message) says the setting blocked a Gemini run. */
export function isAiMetadataDisabledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : (error as { message?: unknown })?.message
  return typeof message === 'string' && message.includes(AI_METADATA_DISABLED_MESSAGE)
}

/**
 * PostgREST/Postgres codes for "table does not exist" (PGRST205: not in the
 * schema cache, 42P01: undefined_table). Before the migration runs, reads end
 * here and fall back to the default.
 */
function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

/**
 * Read the setting through any Supabase client. With an RLS-bound client the
 * tenant filter is optional (RLS returns only the caller's row); with the
 * service role pass `tenantId`. Missing row or missing table means on; any
 * other read error is thrown.
 */
export async function readAiMetadataEnabled(client: SupabaseClient, tenantId?: string): Promise<boolean> {
  let query = client.from('tenant_settings').select('ai_metadata_enabled')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query.maybeSingle()

  if (error) {
    if (isMissingTable(error)) return true
    throw new Error(`Failed to read tenant settings: ${error.message}`)
  }
  return (data as { ai_metadata_enabled?: boolean } | null)?.ai_metadata_enabled ?? true
}
