import { z } from 'zod'
import { getPin, updateAgentPin } from '@/lib/api/pins'
import { defineTool, errorResult, jsonResult } from '../tool'
import { pinToResult } from './pins'
import { provenance } from './pins-write'

/**
 * A plan can carry at most this many pins at once, so one call stays bounded
 * (it reads and writes each pin). Matches the read tools' list cap.
 */
const MAX_SCHEDULE_ENTRIES = 100

/**
 * Scheduling guardrail (ADR-0006): a pin may only be planned at least 15
 * minutes into the future, so the user can still correct a plan in the UI
 * before MQ publishes it. Immediate publish is out of v1.
 */
const MIN_SCHEDULE_BUFFER_MS = 15 * 60 * 1000

/** Only pins with this status may be scheduled — nothing unfinished goes out. */
const SCHEDULABLE_STATUS = 'metadata_created'

/** One entry of a schedule plan. */
interface PlanEntry {
  pin_id: string
  scheduled_at: string
  accepted: boolean
  /** German reason when `accepted` is false. */
  reason?: string
}

/**
 * Validate a single schedule request against the guardrails, reading the pin
 * fresh under the caller's RLS client. Returns a rejected entry with a German
 * reason when the pin is missing, not `metadata_created`, or the time is
 * invalid / inside the 15-minute buffer.
 */
async function evaluateEntry(
  pinId: string,
  scheduledAt: string,
  nowMs: number,
  client: Parameters<typeof getPin>[1],
): Promise<PlanEntry> {
  const base = { pin_id: pinId, scheduled_at: scheduledAt }

  let status: string
  try {
    const pin = await getPin(pinId, client)
    status = pin.status
  } catch {
    return { ...base, accepted: false, reason: 'Pin nicht gefunden oder kein Zugriff.' }
  }

  if (status !== SCHEDULABLE_STATUS) {
    return {
      ...base,
      accepted: false,
      reason: `Falscher Status: nur Pins mit Status ${SCHEDULABLE_STATUS} sind planbar (dieser Pin: ${status}).`,
    }
  }

  const whenMs = Date.parse(scheduledAt)
  if (Number.isNaN(whenMs)) {
    return { ...base, accepted: false, reason: 'Ungültiges Datum (scheduled_at erwartet ISO-8601).' }
  }
  if (whenMs < nowMs + MIN_SCHEDULE_BUFFER_MS) {
    return {
      ...base,
      accepted: false,
      reason: 'Zeitpunkt zu früh: scheduled_at muss mindestens 15 Minuten in der Zukunft liegen.',
    }
  }

  return { ...base, accepted: true }
}

/**
 * `schedule_pins` — plan several pins at once, e.g. spread ten pins across the
 * coming week (Spec #115, user stories 36–39; ADR-0006). The agent passes a
 * `scheduled_at` per pin; the tool checks each against the guardrails (status
 * `metadata_created`, at least 15 minutes ahead) and rejects per pin with a
 * reason. Default is a dry run: the plan is shown, nothing is saved. With
 * `dry_run: false` the accepted pins are written and their MQ publish jobs
 * reconciled over the same path the UI uses (`syncPublishJobs`, ADR-0005).
 */
export const schedulePinsTool = defineTool({
  name: 'schedule_pins',
  description:
    'Plant mehrere Pins auf einmal (z. B. zehn Pins über die nächste Woche verteilen). Pro Pin ein scheduled_at (ISO-8601). Leitplanken: nur Pins mit Status metadata_created, Zeitpunkt mindestens 15 Minuten in der Zukunft. Standard ist ein Probelauf (dry_run), der nur den Plan zeigt; mit dry_run=false werden die angenommenen Pins gespeichert und automatisch über MQ veröffentlicht. Sofort-Veröffentlichung gibt es nicht.',
  inputSchema: {
    schedule: z
      .array(
        z.object({
          pin_id: z.string().describe('ID des Pins.'),
          scheduled_at: z
            .string()
            .describe('Geplanter Veröffentlichungszeitpunkt (ISO-8601, UTC empfohlen).'),
        }),
      )
      .min(1)
      .max(MAX_SCHEDULE_ENTRIES)
      .describe('Die zu planenden Pins mit jeweils einem Zeitpunkt.'),
  },
  dryRun: true,
  handler: async ({ input, dryRun, ctx }) => {
    const nowMs = Date.now()
    const plan: PlanEntry[] = []
    for (const entry of input.schedule) {
      plan.push(await evaluateEntry(entry.pin_id, entry.scheduled_at, nowMs, ctx.supabase))
    }

    const accepted = plan.filter((entry) => entry.accepted)

    if (!dryRun && accepted.length > 0) {
      for (const entry of accepted) {
        await updateAgentPin(
          entry.pin_id,
          { scheduled_at: entry.scheduled_at, ...provenance(ctx) },
          ctx.supabase,
        )
      }
      await ctx.syncPublishJobs?.(accepted.map((entry) => entry.pin_id))
    }

    return jsonResult({
      dry_run: dryRun,
      saved: !dryRun && accepted.length > 0,
      scheduled: accepted.length,
      rejected: plan.length - accepted.length,
      plan,
    })
  },
})

/**
 * `unschedule_pin` — take a pin's plan back so it is not published (Spec #115,
 * user story 40; ADR-0006). Clears `scheduled_at` and reconciles the MQ publish
 * job over the same path the UI uses, cancelling any pending job.
 */
export const unschedulePinTool = defineTool({
  name: 'unschedule_pin',
  description:
    'Nimmt die Planung eines Pins zurück: entfernt scheduled_at, sodass der Pin nicht veröffentlicht wird. Der Status bleibt unverändert.',
  inputSchema: {
    pin_id: z.string().describe('ID des Pins.'),
  },
  handler: async ({ input, ctx }) => {
    let pin
    try {
      pin = await updateAgentPin(
        input.pin_id,
        { scheduled_at: null, ...provenance(ctx) },
        ctx.supabase,
      )
    } catch {
      return errorResult('Pin nicht gefunden oder kein Zugriff.')
    }

    await ctx.syncPublishJobs?.([input.pin_id])
    return jsonResult(pinToResult(pin, ctx))
  },
})
