import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPublishEvents } from './publish-events'
import { createMockQueryBuilder } from '@/test/mocks/supabase'
import type { PublishLogEvent } from '@/types/pins'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

function buildLogEvent(overrides: Partial<PublishLogEvent> = {}): PublishLogEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    pin_id: 'pin-1',
    blog_project_id: 'proj-1',
    event_type: 'succeeded',
    attempt: 1,
    max_attempts: 3,
    message: null,
    details: {},
    created_at: '2026-10-10T10:00:00.000Z',
    pin: { id: 'pin-1', title: 'A pin' },
    ...overrides,
  }
}

describe('getPublishEvents', () => {
  beforeEach(() => {
    mockFrom.mockReset()
  })

  it('reads newest-first and embeds the pin title', async () => {
    const qb = createMockQueryBuilder({ data: [buildLogEvent()] })
    mockFrom.mockReturnValue(qb)

    const result = await getPublishEvents({ limit: 20 })

    expect(mockFrom).toHaveBeenCalledWith('pin_publish_events')
    // Pin title embedded via the FK so the log can link to the pin detail.
    expect(qb.select).toHaveBeenCalledWith(expect.stringContaining('pins'))
    expect(qb.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result.events).toHaveLength(1)
    expect(result.events[0].pin?.title).toBe('A pin')
  })

  it('applies project, event-type and time-range filters', async () => {
    const qb = createMockQueryBuilder({ data: [] })
    mockFrom.mockReturnValue(qb)

    const createdAfter = new Date('2026-10-01T00:00:00.000Z')
    await getPublishEvents({
      projectId: 'proj-7',
      eventTypes: ['failed_final', 'retry_scheduled'],
      createdAfter,
    })

    expect(qb.eq).toHaveBeenCalledWith('blog_project_id', 'proj-7')
    expect(qb.in).toHaveBeenCalledWith('event_type', ['failed_final', 'retry_scheduled'])
    expect(qb.gte).toHaveBeenCalledWith('created_at', createdAfter.toISOString())
  })

  it('returns a nextCursor only when a full page comes back', async () => {
    // limit=2 fetches 3; three rows means there is a next page.
    const rows = [
      buildLogEvent({ created_at: '2026-10-10T10:03:00.000Z' }),
      buildLogEvent({ created_at: '2026-10-10T10:02:00.000Z' }),
      buildLogEvent({ created_at: '2026-10-10T10:01:00.000Z' }),
    ]
    const qb = createMockQueryBuilder({ data: rows })
    mockFrom.mockReturnValue(qb)

    const result = await getPublishEvents({ limit: 2 })

    expect(result.events).toHaveLength(2)
    expect(result.nextCursor).toBe('2026-10-10T10:02:00.000Z')
  })

  it('returns no cursor on the last (partial) page', async () => {
    const qb = createMockQueryBuilder({ data: [buildLogEvent()] })
    mockFrom.mockReturnValue(qb)

    const result = await getPublishEvents({ limit: 20 })

    expect(result.nextCursor).toBeNull()
  })

  it('throws on a query error', async () => {
    const qb = createMockQueryBuilder({ error: { message: 'boom' } })
    mockFrom.mockReturnValue(qb)

    await expect(getPublishEvents({})).rejects.toBeTruthy()
  })
})
