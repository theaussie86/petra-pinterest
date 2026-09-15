import { createServerFn } from '@tanstack/react-start'
import { tasks } from '@trigger.dev/sdk/v3'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import { isTriggerDevEnabled } from '@/lib/config/feature-flags'
import type { generateMetadataTask } from '@/trigger/generate-metadata'

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
 * Server function: Trigger bulk metadata generation via Trigger.dev or the
 * generate_metadata queue (async, ADR-0004).
 * Authenticates via cookies, dispatches jobs for each pin.
 */
export const triggerBulkMetadataFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_ids: string[] }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Not authenticated')

    if (!isTriggerDevEnabled('metadata')) {
      // The RPC checks the tenant, sets the pins to 'generating_metadata' and
      // enqueues them; the queue worker picks them up within ~15s.
      const { data: pinsQueued, error: enqueueError } = await supabase.rpc('enqueue_generate_metadata', {
        p_pin_ids: data.pin_ids,
      })
      if (enqueueError) throw new Error(enqueueError.message)

      return { success: true, pins_queued: pinsQueued as number, useTrigger: false }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Update all selected pins status to 'generating_metadata'
    await supabase
      .from('pins')
      .update({ status: 'generating_metadata' })
      .in('id', data.pin_ids)

    const batchHandle = await tasks.batchTrigger<typeof generateMetadataTask>(
      'generate-metadata',
      data.pin_ids.map((pin_id) => ({
        payload: { pin_id, tenant_id: profile.tenant_id },
      }))
    )
    return {
      success: true,
      pins_queued: data.pin_ids.length,
      batchId: batchHandle.batchId,
      useTrigger: true,
    }
  })

/**
 * Server function: auto-trigger metadata generation after pins are created.
 * Uses the generate_metadata queue or Trigger.dev depending on the feature
 * flag (ADR-0004, issue #89). With the flag off, the tenant-checked RPC sets
 * the pins to 'generating_metadata' and enqueues them; no batch id is returned.
 */
export const triggerAutoMetadataFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_ids: string[] }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Not authenticated')

    if (!isTriggerDevEnabled('metadata')) {
      // Same queue path as bulk metadata: the RPC checks the tenant, sets the
      // pins to 'generating_metadata' and enqueues them for the worker.
      const { data: pinsQueued, error: enqueueError } = await supabase.rpc('enqueue_generate_metadata', {
        p_pin_ids: data.pin_ids,
      })
      if (enqueueError) throw new Error(enqueueError.message)

      return { success: true, pins_queued: pinsQueued as number, useTrigger: false }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Update all pins status to 'generating_metadata'
    await supabase
      .from('pins')
      .update({ status: 'generating_metadata' })
      .in('id', data.pin_ids)

    // Always use Trigger.dev
    const batchHandle = await tasks.batchTrigger<typeof generateMetadataTask>(
      'generate-metadata',
      data.pin_ids.map((pin_id) => ({
        payload: { pin_id, tenant_id: profile.tenant_id },
      }))
    )

    return {
      success: true,
      pins_queued: data.pin_ids.length,
      batchId: batchHandle.batchId,
      useTrigger: true,
    }
  })
