// Account setting "KI-Metadaten automatisch erzeugen (Gemini)" for the Edge
// Functions (ADR-0009). Stored in public.tenant_settings.ai_metadata_enabled
// (migration 00042). Mirrors src/lib/ai-metadata-setting.ts for the Deno side.
//
// Default is on: no row means on, and so does a missing table, so the Edge
// Functions can be deployed before the migration has run.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const AI_METADATA_DISABLED_MESSAGE = 'AI metadata generation is disabled for this account'

/** Thrown by the metadata pipeline before any Gemini work when the setting is off. */
export class AiMetadataDisabledError extends Error {
  constructor() {
    super(AI_METADATA_DISABLED_MESSAGE)
    this.name = 'AiMetadataDisabledError'
  }
}

/**
 * Read the tenant's setting with the service-role client. Missing row or
 * missing table = on. Any other read error is thrown, so the queue retries
 * instead of calling Gemini on a guess.
 */
export async function isAiMetadataEnabled(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('tenant_settings')
    .select('ai_metadata_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') return true
    throw new Error(`Failed to read tenant settings: ${error.message}`)
  }
  return (data as { ai_metadata_enabled?: boolean } | null)?.ai_metadata_enabled ?? true
}

/** Statuses a pin may go back to when a queued generation is dropped. */
const RESTORABLE_STATUSES = ['draft', 'metadata_created']

/**
 * Undo `generating_metadata` for a pin whose queued generation was dropped
 * because the setting is off: back to `previous_status` when that is a resting
 * status (draft, metadata_created), otherwise `draft`. Never `error`, never a
 * mail. Pins that already left `generating_metadata` are left alone.
 */
export async function releasePinFromGeneration(supabase: SupabaseClient, pinId: string): Promise<void> {
  const { data: pin, error: readError } = await supabase
    .from('pins')
    .select('status, previous_status')
    .eq('id', pinId)
    .maybeSingle()
  if (readError) throw new Error(`Failed to read pin ${pinId}: ${readError.message}`)
  if (!pin || pin.status !== 'generating_metadata') return

  const status = RESTORABLE_STATUSES.includes(pin.previous_status ?? '') ? pin.previous_status : 'draft'
  const { error } = await supabase
    .from('pins')
    .update({ status, error_message: null })
    .eq('id', pinId)
    .eq('status', 'generating_metadata')
  if (error) throw new Error(`Failed to reset pin ${pinId}: ${error.message}`)
}
