import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import {
  AI_METADATA_DISABLED_MESSAGE,
  isAiMetadataDisabledError,
  readAiMetadataEnabled,
} from '@/lib/ai-metadata-setting'

interface GeneratedMetadata {
  title: string
  description: string
  alt_text: string
}

/**
 * Authenticate the caller and confirm the pin belongs to their tenant.
 *
 * The read runs through the cookie-bound (RLS) client, so a pin from another
 * tenant is invisible and rejected here — defense-in-depth before we hand the
 * pin to the service-role Edge Function, which itself bypasses RLS.
 */
async function authorizePin(pin_id: string): Promise<string> {
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile) throw new Error('Profile not found')

  const { data: pin, error: pinError } = await supabase
    .from('pins')
    .select('id')
    .eq('id', pin_id)
    .single()
  if (pinError || !pin) throw new Error('Pin not found')

  // Account setting (ADR-0009): the single-pin path calls the Edge Function
  // with the service role and never passes the enqueue RPC, so it checks here.
  if (!(await readAiMetadataEnabled(supabase, profile.tenant_id))) {
    throw new Error(AI_METADATA_DISABLED_MESSAGE)
  }

  return profile.tenant_id
}

/** Pull the human-readable message out of a Supabase Functions error. */
async function edgeErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: { json?: () => Promise<unknown> } }).context
  if (context?.json) {
    try {
      const body = (await context.json()) as { error?: unknown }
      if (body?.error) return String(body.error)
    } catch {
      // Fall through to the error's own message.
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Invoke the synchronous generate-metadata-single Edge Function and wait for
 * the result. Errors from the Edge Function are re-thrown so the dialog can
 * surface them (ADR-0004, issue #88).
 */
async function invokeMetadataEdge(body: {
  pin_id: string
  tenant_id: string
  feedback?: string
}): Promise<{ success: true; metadata: GeneratedMetadata }> {
  const serviceClient = getSupabaseServiceClient()
  const { data, error } = await serviceClient.functions.invoke('generate-metadata-single', {
    body,
  })

  if (error) {
    throw new Error(await edgeErrorMessage(error))
  }
  if (!data?.success) {
    throw new Error(data?.error ?? 'Metadata generation failed')
  }

  return { success: true, metadata: data.metadata as GeneratedMetadata }
}

/**
 * Server function: Generate metadata for a single pin (synchronous).
 * Authenticates via cookies, then calls the metadata Edge Function and waits
 * for the result. No Node AI code runs here (ADR-0004, issue #88).
 */
export const generateMetadataFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_id: string }) => data)
  .handler(async ({ data }) => {
    const tenant_id = await authorizePin(data.pin_id)
    return invokeMetadataEdge({ pin_id: data.pin_id, tenant_id })
  })

/**
 * Server function: Generate metadata for a single pin with feedback
 * (synchronous). Passes the feedback to the metadata Edge Function, which
 * refines the latest generation and stores the feedback in the history
 * (ADR-0004, issue #88).
 */
export const generateMetadataWithFeedbackFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_id: string; feedback: string }) => data)
  .handler(async ({ data }) => {
    const tenant_id = await authorizePin(data.pin_id)
    return invokeMetadataEdge({ pin_id: data.pin_id, tenant_id, feedback: data.feedback })
  })

/**
 * Dispatch metadata generation for the given pins, authenticating via cookies
 * first. The tenant-checked RPC sets the pins to 'generating_metadata' and
 * enqueues them on the generate_metadata queue; the worker picks them up within
 * ~15s (ADR-0004). Returns the de-duplicated count reported by the RPC.
 *
 * When the account switched AI metadata off (ADR-0009) nothing is enqueued:
 * with `silentWhenDisabled` the call reports 0 pins, otherwise it throws.
 */
async function dispatchMetadataGeneration(
  pin_ids: string[],
  { silentWhenDisabled = false }: { silentWhenDisabled?: boolean } = {},
) {
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Not authenticated')

  const disabled = () => {
    if (silentWhenDisabled) return { success: true, pins_queued: 0 }
    throw new Error(AI_METADATA_DISABLED_MESSAGE)
  }

  // RLS scopes the read to the caller's tenant.
  if (!(await readAiMetadataEnabled(supabase))) return disabled()

  const { data: pinsQueued, error: enqueueError } = await supabase.rpc('enqueue_generate_metadata', {
    p_pin_ids: pin_ids,
  })
  if (enqueueError) {
    // The RPC enforces the same setting (hard stop); race with a toggle.
    if (isAiMetadataDisabledError(enqueueError)) return disabled()
    throw new Error(enqueueError.message)
  }

  return { success: true, pins_queued: pinsQueued as number }
}

/**
 * Server function: trigger bulk metadata generation via the generate_metadata
 * queue (async, ADR-0004). Authenticates via cookies, enqueues jobs for each
 * pin. Throws when the account switched AI metadata off (ADR-0009).
 */
export const triggerBulkMetadataFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_ids: string[] }) => data)
  .handler(({ data }) => dispatchMetadataGeneration(data.pin_ids))

/**
 * Server function: auto-trigger metadata generation after pins are created.
 * Enqueues the pins on the generate_metadata queue via the tenant-checked RPC,
 * which also sets them to 'generating_metadata' (ADR-0004, issue #89).
 * When the account switched AI metadata off (ADR-0009) it quietly returns
 * `pins_queued: 0` and the new pins stay `draft`.
 */
export const triggerAutoMetadataFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_ids: string[] }) => data)
  .handler(({ data }) => dispatchMetadataGeneration(data.pin_ids, { silentWhenDisabled: true }))
