import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n'
import type { PinPublishEventType, PublishLogEvent } from '@/types/pins'
import { PUBLISH_ERROR_EVENT_TYPES } from '@/types/pins'

// --- Mocks ------------------------------------------------------------------

// Capture the realtime subscription args to assert the live-update wiring.
const realtimeCalls: Array<unknown[]> = []
vi.mock('@/lib/hooks/use-realtime', () => ({
  useRealtimeInvalidation: (...args: unknown[]) => {
    realtimeCalls.push(args)
  },
}))

// Render the router Link as an anchor carrying its target so the test can
// assert the pin link resolves to the right pin.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a data-to={to} data-params={JSON.stringify(params ?? {})}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/hooks/use-blog-projects', () => ({
  useBlogProjects: () => ({
    data: [
      { id: 'proj-1', name: 'Backblog' },
      { id: 'proj-2', name: 'Reiseblog' },
    ],
  }),
}))

// usePublishEvents is driven per-test. We capture the filters it receives so we
// can assert the filter controls feed through.
const hookCalls: Array<unknown> = []
let mockPages: Array<{ events: PublishLogEvent[] }> = []
let mockHasNextPage = false
const mockFetchNextPage = vi.fn()
vi.mock('@/lib/hooks/use-publish-events', () => ({
  usePublishEvents: (filters: unknown) => {
    hookCalls.push(filters)
    return {
      data: { pages: mockPages },
      isLoading: false,
      fetchNextPage: mockFetchNextPage,
      hasNextPage: mockHasNextPage,
      isFetchingNextPage: false,
    }
  },
}))

import { PublishLog, resolvePublishEventFilters } from './publish-log'

function buildLogEvent(
  type: PinPublishEventType,
  overrides: Partial<PublishLogEvent> = {},
): PublishLogEvent {
  return {
    id: `evt-${type}-${Math.random().toString(36).slice(2)}`,
    pin_id: 'pin-1',
    blog_project_id: 'proj-1',
    event_type: type,
    attempt: 1,
    max_attempts: 3,
    message: `message for ${type}`,
    details: {},
    created_at: '2026-10-10T10:00:00.000Z',
    pin: { id: 'pin-1', title: 'My Pin' },
    ...overrides,
  }
}

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  cleanup()
  mockPages = []
  mockHasNextPage = false
  mockFetchNextPage.mockClear()
  realtimeCalls.length = 0
  hookCalls.length = 0
})

// --- Pure filter resolution -------------------------------------------------

describe('resolvePublishEventFilters', () => {
  const now = new Date('2026-10-10T12:00:00.000Z')

  it('maps project "all" to no project filter, a specific id through', () => {
    expect(
      resolvePublishEventFilters(
        { projectId: 'all', selectedTypes: [], onlyErrors: false, timeRange: 'all' },
        now,
      ).projectId,
    ).toBeUndefined()
    expect(
      resolvePublishEventFilters(
        { projectId: 'proj-2', selectedTypes: [], onlyErrors: false, timeRange: 'all' },
        now,
      ).projectId,
    ).toBe('proj-2')
  })

  it('"only errors" overrides the selected event types with the error set', () => {
    const filters = resolvePublishEventFilters(
      { projectId: 'all', selectedTypes: ['succeeded'], onlyErrors: true, timeRange: 'all' },
      now,
    )
    expect(filters.eventTypes).toEqual(PUBLISH_ERROR_EVENT_TYPES)
  })

  it('passes a non-empty event-type selection through, empty becomes undefined', () => {
    expect(
      resolvePublishEventFilters(
        { projectId: 'all', selectedTypes: ['succeeded'], onlyErrors: false, timeRange: 'all' },
        now,
      ).eventTypes,
    ).toEqual(['succeeded'])
    expect(
      resolvePublishEventFilters(
        { projectId: 'all', selectedTypes: [], onlyErrors: false, timeRange: 'all' },
        now,
      ).eventTypes,
    ).toBeUndefined()
  })

  it('turns a time range into a createdAfter lower bound ("all" = none)', () => {
    expect(
      resolvePublishEventFilters(
        { projectId: 'all', selectedTypes: [], onlyErrors: false, timeRange: 'all' },
        now,
      ).createdAfter,
    ).toBeUndefined()
    const sevenDays = resolvePublishEventFilters(
      { projectId: 'all', selectedTypes: [], onlyErrors: false, timeRange: '7d' },
      now,
    ).createdAfter
    expect(sevenDays?.toISOString()).toBe('2026-10-03T12:00:00.000Z')
  })
})

// --- Component --------------------------------------------------------------

describe('PublishLog', () => {
  it('renders a row per event with time, project, pin link, badge, attempt and message', () => {
    mockPages = [
      {
        events: [
          buildLogEvent('retry_scheduled', {
            pin_id: 'pin-42',
            blog_project_id: 'proj-2',
            attempt: 2,
            max_attempts: 5,
            message: 'Rate limit',
            pin: { id: 'pin-42', title: 'Travel Pin' },
          }),
        ],
      },
    ]
    render(<PublishLog />)

    // Scope the badge/cell assertions to the table — the event-type labels also
    // appear as filter chips above it.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Wiederholung geplant')).toBeTruthy()
    expect(table.getByText('Reiseblog')).toBeTruthy()
    expect(table.getByText('Versuch 2 von 5')).toBeTruthy()
    expect(table.getByText('Rate limit')).toBeTruthy()

    // The pin cell links to the right pin detail route.
    const link = screen.getByText('Travel Pin').closest('a')!
    expect(link.getAttribute('data-to')).toBe('/projects/$projectId/pins/$pinId')
    expect(JSON.parse(link.getAttribute('data-params')!)).toEqual({
      projectId: 'proj-2',
      pinId: 'pin-42',
    })
  })

  it('flattens multiple pages and shows a load-more button that fetches the next page', () => {
    mockPages = [
      { events: [buildLogEvent('succeeded', { message: 'page one' })] },
      { events: [buildLogEvent('attempt_started', { message: 'page two' })] },
    ]
    mockHasNextPage = true
    render(<PublishLog />)

    expect(screen.getByText('page one')).toBeTruthy()
    expect(screen.getByText('page two')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Mehr laden/ }))
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('subscribes to realtime INSERTs on pin_publish_events (tenant-wide)', () => {
    render(<PublishLog />)
    expect(realtimeCalls).toHaveLength(1)
    const [, config] = realtimeCalls[0] as [string, { event: string; table: string }]
    expect(config.event).toBe('INSERT')
    expect(config.table).toBe('pin_publish_events')
  })

  it('shows a realtime-inserted event after the query refetches (no reload)', () => {
    mockPages = [{ events: [buildLogEvent('attempt_started', { message: 'first' })] }]
    const { rerender } = render(<PublishLog />)
    expect(screen.queryByText('second')).toBeNull()

    mockPages = [
      {
        events: [
          buildLogEvent('succeeded', { message: 'second' }),
          buildLogEvent('attempt_started', { message: 'first' }),
        ],
      },
    ]
    rerender(<PublishLog />)
    expect(screen.getByText('second')).toBeTruthy()
    expect(screen.getByText('first')).toBeTruthy()
  })

  it('feeds the "only errors" toggle through to the query as the error event set', () => {
    render(<PublishLog />)
    // Initial call: no event-type filter.
    const first = hookCalls[0] as { eventTypes?: unknown }
    expect(first.eventTypes).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: /Nur Fehler/ }))

    const last = hookCalls[hookCalls.length - 1] as { eventTypes?: unknown }
    expect(last.eventTypes).toEqual(PUBLISH_ERROR_EVENT_TYPES)
  })

  it('renders the empty state when there are no events', () => {
    mockPages = [{ events: [] }]
    render(<PublishLog />)
    expect(screen.getByText('Noch keine Veröffentlichungsereignisse')).toBeTruthy()
  })
})
