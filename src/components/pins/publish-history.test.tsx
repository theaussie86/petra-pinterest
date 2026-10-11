import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n'
import type { PinPublishEvent, PinPublishEventType } from '@/types/pins'

// Capture the realtime subscription args so we can assert on the live-update
// wiring without a real Supabase channel.
const realtimeCalls: Array<unknown[]> = []
vi.mock('@/lib/hooks/use-realtime', () => ({
  useRealtimeInvalidation: (...args: unknown[]) => {
    realtimeCalls.push(args)
  },
}))

let mockEvents: PinPublishEvent[] = []
let mockLoading = false
vi.mock('@/lib/hooks/use-pin-publish-events', () => ({
  usePinPublishEvents: () => ({ data: mockEvents, isLoading: mockLoading }),
}))

import { PublishHistory } from './publish-history'

function buildEvent(
  type: PinPublishEventType,
  overrides: Partial<PinPublishEvent> = {},
): PinPublishEvent {
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
    ...overrides,
  }
}

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  cleanup()
  mockEvents = []
  mockLoading = false
  realtimeCalls.length = 0
})

describe('PublishHistory', () => {
  it('renders readable German labels for all five event types', () => {
    mockEvents = [
      buildEvent('attempt_started', { created_at: '2026-10-10T10:05:00.000Z' }),
      buildEvent('succeeded', { created_at: '2026-10-10T10:04:00.000Z' }),
      buildEvent('retry_scheduled', {
        created_at: '2026-10-10T10:03:00.000Z',
        details: { next_retry_at: '2026-10-10T11:00:00.000Z' },
      }),
      buildEvent('failed_final', { created_at: '2026-10-10T10:02:00.000Z' }),
      buildEvent('mail_sent', {
        created_at: '2026-10-10T10:01:00.000Z',
        attempt: null,
        max_attempts: null,
      }),
    ]
    render(<PublishHistory pinId="pin-1" />)

    expect(screen.getByText('Versuch gestartet')).toBeTruthy()
    expect(screen.getByText('Erfolgreich')).toBeTruthy()
    expect(screen.getByText('Wiederholung geplant')).toBeTruthy()
    expect(screen.getByText('Endgültig fehlgeschlagen')).toBeTruthy()
    expect(screen.getByText('E-Mail gesendet')).toBeTruthy()
  })

  it('shows attempt counter, message and the next-retry time for retry_scheduled', () => {
    mockEvents = [
      buildEvent('retry_scheduled', {
        attempt: 2,
        max_attempts: 5,
        message: 'Rate limit hit',
        details: { next_retry_at: '2026-10-10T11:00:00.000Z', http_status: 429 },
      }),
    ]
    render(<PublishHistory pinId="pin-1" />)

    expect(screen.getByText('Versuch 2 von 5')).toBeTruthy()
    expect(screen.getByText('Rate limit hit')).toBeTruthy()
    // Next retry line references the absolute time and the details JSON toggle.
    expect(screen.getByText(/Nächster Versuch/)).toBeTruthy()
    expect(screen.getByText('Details anzeigen')).toBeTruthy()
    expect(screen.getByText(/429/)).toBeTruthy()
  })

  it('orders events newest first (as delivered by the query)', () => {
    mockEvents = [
      buildEvent('succeeded', { message: 'newest' }),
      buildEvent('attempt_started', { message: 'oldest' }),
    ]
    render(<PublishHistory pinId="pin-1" />)

    const items = screen.getAllByRole('listitem')
    expect(items[0].textContent).toContain('newest')
    expect(items[1].textContent).toContain('oldest')
  })

  it('subscribes to realtime INSERTs filtered by pin_id', () => {
    mockEvents = []
    render(<PublishHistory pinId="pin-42" />)

    expect(realtimeCalls).toHaveLength(1)
    const [channel, config] = realtimeCalls[0] as [string, { event: string; table: string; filter?: string }]
    expect(channel).toContain('pin-42')
    expect(config.event).toBe('INSERT')
    expect(config.table).toBe('pin_publish_events')
    expect(config.filter).toBe('pin_id=eq.pin-42')
  })

  it('shows a realtime-inserted event after the query refetches (no reload)', () => {
    mockEvents = [buildEvent('attempt_started', { message: 'first' })]
    const { rerender } = render(<PublishHistory pinId="pin-1" />)
    expect(screen.queryByText('second')).toBeNull()

    // Realtime invalidation makes the query return a new row; re-render with it.
    mockEvents = [
      buildEvent('succeeded', { message: 'second' }),
      buildEvent('attempt_started', { message: 'first' }),
    ]
    rerender(<PublishHistory pinId="pin-1" />)

    expect(screen.getByText('second')).toBeTruthy()
    expect(screen.getByText('first')).toBeTruthy()
  })

  it('renders the empty state when there are no events', () => {
    mockEvents = []
    render(<PublishHistory pinId="pin-1" />)

    expect(screen.getByText('Noch keine Veröffentlichungsversuche')).toBeTruthy()
  })
})
