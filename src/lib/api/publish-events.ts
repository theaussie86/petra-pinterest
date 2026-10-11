import { supabase } from '@/lib/supabase'
import type { PinPublishEventType, PublishLogEvent } from '@/types/pins'

export interface GetPublishEventsOptions {
  /** created_at of the last row of the previous page (exclusive upper bound). */
  cursor?: string
  limit?: number
  /** Restrict to a single project. Omit for the tenant-wide log. */
  projectId?: string
  /** Restrict to these event types (multi-select / "only errors"). */
  eventTypes?: PinPublishEventType[]
  /** Lower bound on created_at (time-range filter). */
  createdAfter?: Date
}

export interface PaginatedPublishEventsResult {
  events: PublishLogEvent[]
  nextCursor: string | null
}

/**
 * Global publish-event log (issue #111), newest first, with cursor pagination
 * over created_at. Rows are written by the MQ worker; the app only reads them
 * (RLS scopes the rows to the caller's tenant via blog_project_id, so the
 * tenant-wide read here only ever returns the caller's own projects). The pin
 * title is embedded via the pin_id FK so the table can link to the pin detail.
 */
export async function getPublishEvents(
  options: GetPublishEventsOptions = {}
): Promise<PaginatedPublishEventsResult> {
  const { cursor, limit = 50, projectId, eventTypes, createdAfter } = options

  // Fetch one extra row so we can tell whether a further page follows.
  const take = limit + 1

  let query = supabase
    .from('pin_publish_events')
    .select('*, pin:pins(id, title)')

  if (projectId) query = query.eq('blog_project_id', projectId)
  if (eventTypes && eventTypes.length > 0) query = query.in('event_type', eventTypes)
  if (createdAfter) query = query.gte('created_at', createdAfter.toISOString())
  if (cursor) query = query.lt('created_at', cursor)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(take)

  if (error) throw error

  const rows = (data as PublishLogEvent[] | null) ?? []
  const hasMore = rows.length > limit
  const events = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? events[events.length - 1].created_at : null

  return { events, nextCursor }
}
