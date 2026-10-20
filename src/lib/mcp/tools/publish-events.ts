import { z } from 'zod'
import { getPublishEvents } from '@/lib/api/publish-events'
import type { PinPublishEventType } from '@/types/pins'
import { defineTool, jsonResult } from '../tool'
import { MAX_LIST_LIMIT } from './limits'

/**
 * `list_publish_events` — the publish log: what MQ published or failed to
 * publish, newest first, cursor-paginated over `created_at` (Spec #115, user
 * story 27). The agent uses it to see outcomes and errors.
 */
export const listPublishEventsTool = defineTool({
  name: 'list_publish_events',
  description:
    'Listet das Publish-Log (neueste zuerst): was veröffentlicht wurde oder fehlschlug, mit Pin-Titel. Filter: Projekt, Ereignistypen, Zeitraum (created_after). Cursor-Paginierung über next_cursor.',
  inputSchema: {
    project_id: z.string().optional().describe('Nur Ereignisse dieses Projekts.'),
    event_types: z
      .array(z.string())
      .optional()
      .describe('Nur diese Ereignistypen (z. B. succeeded, failed_final, retry_scheduled).'),
    created_after: z
      .string()
      .optional()
      .describe('Nur Ereignisse ab diesem Zeitpunkt (ISO-8601).'),
    cursor: z
      .string()
      .optional()
      .describe('created_at des letzten Eintrags der vorigen Seite (next_cursor).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIST_LIMIT)
      .optional()
      .describe(`Maximale Anzahl (1–${MAX_LIST_LIMIT}). Standard 50.`),
  },
  handler: async ({ input, ctx }) => {
    const { events, nextCursor } = await getPublishEvents(
      {
        projectId: input.project_id,
        eventTypes: input.event_types as PinPublishEventType[] | undefined,
        createdAfter: input.created_after ? new Date(input.created_after) : undefined,
        cursor: input.cursor,
        limit: input.limit,
      },
      ctx.supabase,
    )
    return jsonResult({
      count: events.length,
      next_cursor: nextCursor,
      events: events.map((e) => ({
        id: e.id,
        pin_id: e.pin_id,
        pin_title: e.pin?.title ?? null,
        project_id: e.blog_project_id,
        event_type: e.event_type,
        attempt: e.attempt,
        max_attempts: e.max_attempts,
        message: e.message,
        created_at: e.created_at,
      })),
    })
  },
})
