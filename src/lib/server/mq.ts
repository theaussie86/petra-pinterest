/**
 * Server-only client for the external message queue (MQ).
 *
 * Pinfinity is a *producer*: when a pin's publish schedule is saved or changed
 * it enqueues a delayed `pinfinity.publish-pin` job (replacing any existing one
 * for the same pin), and it removes that job when the pin is no longer a
 * publish candidate. The MQ worker writes the result straight back into
 * Pinfinity's Supabase, so no callback is needed here (PRD
 * theaussie86/weissteiner-automation-mq#5, ADR-0004/0009).
 *
 * Failure policy: an MQ outage must **never** block saving a pin. Both
 * functions catch every error (config, timeout, network, HTTP), log it via
 * `console.error`, and return a typed result instead of throwing. The MQ
 * reconcile job (ticket #14) re-enqueues anything that was dropped here.
 *
 * `MQ_API_URL` / `MQ_API_KEY` are read from `process.env` and must stay
 * server-side — they are never exposed to the client bundle.
 */

/** Queue the publish jobs live in (MQ consumer `pinfinity`, scope `integrations`). */
const QUEUE = 'integrations'
const JOB_TYPE = 'pinfinity.publish-pin'
/** Supabase credential name the MQ worker uses to write results back. */
const SUPABASE_CREDENTIAL = 'pinfinity-supabase'
const TIMEOUT_MS = 5000

export type MqErrorKind = 'config' | 'timeout' | 'network' | 'http'

/** Typed error for every MQ failure mode. Surfaced via the result, never thrown to callers. */
export class MqError extends Error {
  readonly kind: MqErrorKind
  readonly status?: number

  constructor(kind: MqErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'MqError'
    this.kind = kind
    this.status = status
  }
}

export interface EnqueuePublishPinInput {
  pinId: string
  /** When the pin should publish — drives the job delay (and travels in the payload). */
  scheduledAt: string | Date
  /** Tenant UUID; satisfies MQ's `^[a-z0-9][a-z0-9-]{0,63}$` tenant rule. */
  tenantId: string
}

export type EnqueuePublishPinResult =
  | { status: 'enqueued' }
  | { status: 'error'; error: MqError }

export type CancelPublishPinResult =
  | { status: 'cancelled' }
  /** The job is `active` (409): it is already running and cannot be removed. */
  | { status: 'running' }
  | { status: 'error'; error: MqError }

function publishJobId(pinId: string): string {
  return `publish-pin-${pinId}`
}

function readConfig(): { url: string; key: string } {
  const url = process.env.MQ_API_URL
  const key = process.env.MQ_API_KEY
  if (!url || !key) {
    throw new MqError('config', 'MQ_API_URL / MQ_API_KEY are not configured')
  }
  return { url: url.replace(/\/+$/, ''), key }
}

function toMqError(err: unknown): MqError {
  if (err instanceof MqError) return err
  // `AbortSignal.timeout()` rejects with a TimeoutError; a manual abort with AbortError.
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return new MqError('timeout', `MQ request timed out after ${TIMEOUT_MS}ms`)
  }
  return new MqError('network', err instanceof Error ? err.message : String(err))
}

/**
 * Enqueue (or replace) the delayed publish job for a pin.
 *
 * `POST {MQ_API_URL}/jobs` with `onExisting: "replace"` so a changed schedule
 * overwrites the previous job. `delay` is `max(0, scheduledAt - now)` in ms.
 */
export async function enqueuePublishPin(
  input: EnqueuePublishPinInput,
): Promise<EnqueuePublishPinResult> {
  const { pinId, scheduledAt, tenantId } = input
  try {
    const { url, key } = readConfig()
    const scheduledAtDate = new Date(scheduledAt)
    const scheduledAtIso = scheduledAtDate.toISOString()
    const delay = Math.max(0, scheduledAtDate.getTime() - Date.now())

    const response = await fetch(`${url}/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: JOB_TYPE,
        tenant: tenantId,
        jobId: publishJobId(pinId),
        onExisting: 'replace',
        delay,
        payload: {
          supabaseCredential: SUPABASE_CREDENTIAL,
          pinId,
          scheduledAt: scheduledAtIso,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new MqError(
        'http',
        `MQ POST /jobs failed with ${response.status}`,
        response.status,
      )
    }

    return { status: 'enqueued' }
  } catch (err) {
    const error = toMqError(err)
    console.error(
      `[mq] enqueuePublishPin(${pinId}) failed: ${error.kind} — ${error.message}`,
    )
    return { status: 'error', error }
  }
}

/**
 * Remove the pending publish job for a pin.
 *
 * `DELETE {MQ_API_URL}/jobs/publish-pin-<pinId>?queue=integrations`. A 404 means
 * there was nothing to remove and counts as success. A 409 means the job is
 * already running; that is reported as `running`, not an error (the job guards
 * itself against a stale schedule).
 */
export async function cancelPublishPin(pinId: string): Promise<CancelPublishPinResult> {
  try {
    const { url, key } = readConfig()

    const response = await fetch(
      `${url}/jobs/${publishJobId(pinId)}?queue=${QUEUE}`,
      {
        method: 'DELETE',
        // No body and no content-type: MQ rejects an empty JSON body otherwise.
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )

    if (response.status === 409) {
      return { status: 'running' }
    }
    if (response.ok || response.status === 404) {
      return { status: 'cancelled' }
    }

    throw new MqError(
      'http',
      `MQ DELETE /jobs failed with ${response.status}`,
      response.status,
    )
  } catch (err) {
    const error = toMqError(err)
    console.error(
      `[mq] cancelPublishPin(${pinId}) failed: ${error.kind} — ${error.message}`,
    )
    return { status: 'error', error }
  }
}
