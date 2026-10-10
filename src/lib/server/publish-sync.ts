import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from './supabase'
import { enqueuePublishPin, cancelPublishPin } from './mq'

/**
 * Keep the external MQ publish job in sync with a pin's publish eligibility.
 *
 * A pin is a *publish candidate* when it can and should be published by the MQ
 * worker: `status = metadata_created`, a `scheduled_at` is set, it has not been
 * published yet (`pinterest_pin_id` empty), it carries a board, and its project
 * has a Pinterest connection. Whenever a write path changes any of those, call
 * `syncPublishJobs` with the affected pin ids — candidates get their delayed
 * `pinfinity.publish-pin` job (re)enqueued (replacing a stale schedule), and
 * everything else gets its pending job cancelled (PRD
 * theaussie86/weissteiner-automation-mq#5, issue #104).
 *
 * The rule is re-evaluated against a *fresh* read of the pin, so it is correct
 * no matter which field the caller changed (schedule, status, board, delete).
 *
 * Failure policy mirrors the MQ client (`mq.ts`): an MQ or database hiccup must
 * never break the originating mutation. Every path here catches and logs; the
 * MQ reconcile job (MQ #14) re-enqueues anything dropped.
 */

/** The fields the publish-eligibility rule reads. */
export interface PublishEligibilityPin {
  status: string
  scheduled_at: string | null
  pinterest_pin_id: string | null
  pinterest_board_id: string | null
}

/** Pure rule: should the MQ hold a pending publish job for this pin? */
export function isPublishCandidate(
  pin: PublishEligibilityPin,
  hasConnection: boolean,
): boolean {
  return (
    pin.status === 'metadata_created' &&
    !!pin.scheduled_at &&
    !pin.pinterest_pin_id &&
    !!pin.pinterest_board_id &&
    hasConnection
  )
}

interface SyncRow extends PublishEligibilityPin {
  id: string
  tenant_id: string
  blog_projects: { pinterest_connection_id: string | null } | null
}

/**
 * Reconcile the MQ publish jobs for the given pins against their current state.
 *
 * Reads the pins fresh (through the cookie-bound RLS client, so only the
 * caller's tenant is visible) together with their project's Pinterest
 * connection, then enqueues or cancels per the rule. Any requested id that no
 * longer resolves to a pin (e.g. just deleted) has its job cancelled. Never
 * throws — the result is informational for an optional "queued later" toast.
 *
 * Kept internal (not exported) so the client build strips it together with its
 * server-only `./mq` and `./supabase` imports; call it over the wire through
 * `syncPublishJobsFn`.
 */
async function syncPublishJobs(
  pinIds: string[],
): Promise<{ synced: number; failed: number }> {
  if (pinIds.length === 0) return { synced: 0, failed: 0 }

  let failed = 0
  const bump = (ok: boolean) => {
    if (!ok) failed += 1
  }

  try {
    const client = getSupabaseServerClient()
    const { data, error } = await client
      .from('pins')
      .select(
        'id, tenant_id, status, scheduled_at, pinterest_pin_id, pinterest_board_id, blog_projects(pinterest_connection_id)',
      )
      .in('id', pinIds)

    if (error) throw error

    const rows = (data ?? []) as unknown as SyncRow[]
    const byId = new Map(rows.map((row) => [row.id, row]))

    for (const pinId of pinIds) {
      const row = byId.get(pinId)

      // Missing row = deleted or no longer visible: make sure no job lingers.
      if (!row) {
        const result = await cancelPublishPin(pinId)
        bump(result.status !== 'error')
        continue
      }

      const hasConnection = !!row.blog_projects?.pinterest_connection_id
      if (isPublishCandidate(row, hasConnection)) {
        const result = await enqueuePublishPin({
          pinId: row.id,
          scheduledAt: row.scheduled_at!,
          tenantId: row.tenant_id,
        })
        bump(result.status !== 'error')
      } else {
        const result = await cancelPublishPin(row.id)
        bump(result.status !== 'error')
      }
    }
  } catch (err) {
    // A failed read means we could not reconcile anything — treat the whole
    // batch as deferred to the reconcile job rather than failing the mutation.
    console.error(
      `[publish-sync] syncPublishJobs failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { synced: 0, failed: pinIds.length }
  }

  return { synced: pinIds.length - failed, failed }
}

/**
 * Server-function wrapper so client write paths can trigger a sync over the
 * wire. Resolves to the sync summary; it never rejects for an MQ failure.
 */
export const syncPublishJobsFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pinIds: string[] }) => data)
  .handler(({ data }) => syncPublishJobs(data.pinIds))
