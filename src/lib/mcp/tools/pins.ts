import { z } from 'zod'
import { getPin, getPinStatusCounts, listPins } from '@/lib/api/pins'
import type { Pin } from '@/types/pins'
import type { McpUserContext } from '../context'
import { defineTool, jsonResult } from '../tool'
import { MAX_LIST_LIMIT } from './limits'

/**
 * Shape a pin for an agent: everything needed to keep working with it — the
 * public image URL, metadata, board, scheduling and status (Spec #115
 * acceptance: "Pin mit Bild-URL, Metadaten, Board, scheduled_at, Status").
 */
export function pinToResult(pin: Pin, ctx: McpUserContext) {
  const image_url = pin.image_path
    ? ctx.supabase.storage.from('pin-images').getPublicUrl(pin.image_path).data
        .publicUrl
    : null
  return {
    id: pin.id,
    project_id: pin.blog_project_id,
    article_id: pin.blog_article_id,
    status: pin.status,
    title: pin.title,
    description: pin.description,
    alt_text: pin.alt_text,
    link: pin.alternate_url,
    board: pin.pinterest_board_id
      ? { id: pin.pinterest_board_id, name: pin.pinterest_board_name }
      : null,
    image_url,
    media_type: pin.media_type,
    ai_modified: pin.ai_modified,
    synthetic_performer: pin.synthetic_performer,
    scheduled_at: pin.scheduled_at,
    published_at: pin.published_at,
    pinterest_pin_url: pin.pinterest_pin_url,
    error_message: pin.error_message,
    created_at: pin.created_at,
    updated_at: pin.updated_at,
  }
}

/**
 * `list_pins` — pins filtered by status, project and a `scheduled_at` range,
 * ordered by schedule (Spec #115, user story 22: "Was geht nächste Woche
 * raus?"). Capped by `limit` so the result stays context-sized.
 */
export const listPinsTool = defineTool({
  name: 'list_pins',
  description:
    'Listet Pins mit Bild-URL, Metadaten, Board, Planung und Status. Filter: Status (Liste), Projekt und Planungszeitraum (scheduled_from/scheduled_to, ISO-Datum). Nach Planung sortiert, durch limit begrenzt.',
  inputSchema: {
    project_id: z.string().optional().describe('Nur Pins dieses Projekts.'),
    status: z
      .array(z.string())
      .optional()
      .describe('Nur Pins mit einem dieser Status (z. B. metadata_created, published).'),
    scheduled_from: z
      .string()
      .optional()
      .describe('Untere Grenze für scheduled_at (ISO-8601, inklusive).'),
    scheduled_to: z
      .string()
      .optional()
      .describe('Obere Grenze für scheduled_at (ISO-8601, inklusive).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIST_LIMIT)
      .optional()
      .describe(`Maximale Anzahl (1–${MAX_LIST_LIMIT}). Standard 20.`),
  },
  handler: async ({ input, ctx }) => {
    const { pins, hasMore } = await listPins(
      {
        projectId: input.project_id,
        status: input.status,
        scheduledFrom: input.scheduled_from,
        scheduledTo: input.scheduled_to,
        limit: input.limit,
      },
      ctx.supabase,
    )
    return jsonResult({
      count: pins.length,
      has_more: hasMore,
      pins: pins.map((pin) => pinToResult(pin, ctx)),
    })
  },
})

/**
 * `get_pin` — one pin in full, including image URL, metadata, board and
 * scheduling (Spec #115, user story 23).
 */
export const getPinTool = defineTool({
  name: 'get_pin',
  description:
    'Liefert einen einzelnen Pin mit Bild-URL, Metadaten, Board, Planung und Status anhand seiner ID.',
  inputSchema: {
    pin_id: z.string().describe('Die ID des Pins.'),
  },
  handler: async ({ input, ctx }) => {
    const pin = await getPin(input.pin_id, ctx.supabase)
    return jsonResult(pinToResult(pin, ctx))
  },
})

/**
 * `get_pin_status_counts` — pin totals per status, overall or for one project,
 * for a quick overview (Spec #115, user story 24).
 */
export const getPinStatusCountsTool = defineTool({
  name: 'get_pin_status_counts',
  description:
    'Zählt Pins pro Status. Ohne project_id über alle Projekte, mit project_id nur für dieses Projekt.',
  inputSchema: {
    project_id: z.string().optional().describe('Nur dieses Projekt zählen.'),
  },
  handler: async ({ input, ctx }) => {
    const counts = await getPinStatusCounts(input.project_id, ctx.supabase)
    return jsonResult({ counts })
  },
})
