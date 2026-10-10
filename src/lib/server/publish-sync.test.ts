import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isPublishCandidate, syncPublishJobsFn } from './publish-sync'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockEnqueue, mockCancel, mockServerClient } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockCancel: vi.fn(),
  mockServerClient: { from: vi.fn() },
}))

// Unwrap the server fn to its handler so we can call the sync logic directly.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: any) => ({
      handler: (handler: any) => (input: any) => handler({ data: validator(input.data) }),
    }),
  }),
}))

vi.mock('./mq', () => ({
  enqueuePublishPin: mockEnqueue,
  cancelPublishPin: mockCancel,
}))

vi.mock('./supabase', () => ({
  getSupabaseServerClient: () => mockServerClient,
}))

/** Invoke the sync logic the way the client calls the server fn. */
const syncPublishJobs = (pinIds: string[]) =>
  syncPublishJobsFn({ data: { pinIds } })

/** Row shape the sync query returns (pins + joined project connection). */
function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pin-1',
    tenant_id: 'tenant-1',
    status: 'metadata_created',
    scheduled_at: '2026-10-20T09:00:00.000Z',
    pinterest_pin_id: null,
    pinterest_board_id: 'board-1',
    blog_projects: { pinterest_connection_id: 'conn-1' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnqueue.mockResolvedValue({ status: 'enqueued' })
  mockCancel.mockResolvedValue({ status: 'cancelled' })
})

describe('isPublishCandidate()', () => {
  const base = {
    status: 'metadata_created',
    scheduled_at: '2026-10-20T09:00:00.000Z',
    pinterest_pin_id: null,
    pinterest_board_id: 'board-1',
  }

  it('is true when status, schedule, board and connection line up and no pin id yet', () => {
    expect(isPublishCandidate(base, true)).toBe(true)
  })

  it('is false when status is not metadata_created', () => {
    expect(isPublishCandidate({ ...base, status: 'draft' }, true)).toBe(false)
  })

  it('is false when scheduled_at is missing', () => {
    expect(isPublishCandidate({ ...base, scheduled_at: null }, true)).toBe(false)
  })

  it('is false when the pin is already published (pinterest_pin_id set)', () => {
    expect(isPublishCandidate({ ...base, pinterest_pin_id: 'pin-abc' }, true)).toBe(false)
  })

  it('is false when the pin has no board', () => {
    expect(isPublishCandidate({ ...base, pinterest_board_id: null }, true)).toBe(false)
  })

  it('is false when the project has no Pinterest connection', () => {
    expect(isPublishCandidate(base, false)).toBe(false)
  })
})

describe('syncPublishJobs()', () => {
  it('enqueues a candidate pin with its schedule and tenant', async () => {
    const qb = createMockQueryBuilder({ data: [buildRow()] })
    mockServerClient.from.mockReturnValue(qb)

    await syncPublishJobs(['pin-1'])

    expect(mockEnqueue).toHaveBeenCalledWith({
      pinId: 'pin-1',
      scheduledAt: '2026-10-20T09:00:00.000Z',
      tenantId: 'tenant-1',
    })
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('cancels the job when the pin is no longer a candidate', async () => {
    const qb = createMockQueryBuilder({ data: [buildRow({ status: 'draft' })] })
    mockServerClient.from.mockReturnValue(qb)

    await syncPublishJobs(['pin-1'])

    expect(mockCancel).toHaveBeenCalledWith('pin-1')
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('cancels the job for a pin that no longer exists (deleted)', async () => {
    const qb = createMockQueryBuilder({ data: [] })
    mockServerClient.from.mockReturnValue(qb)

    await syncPublishJobs(['pin-1'])

    expect(mockCancel).toHaveBeenCalledWith('pin-1')
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('processes each pin independently in a bulk call', async () => {
    const qb = createMockQueryBuilder({
      data: [
        buildRow({ id: 'pin-1' }),
        buildRow({ id: 'pin-2', status: 'published', pinterest_pin_id: 'x' }),
      ],
    })
    mockServerClient.from.mockReturnValue(qb)

    await syncPublishJobs(['pin-1', 'pin-2'])

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ pinId: 'pin-1' }),
    )
    expect(mockCancel).toHaveBeenCalledWith('pin-2')
  })

  it('does nothing for an empty id list', async () => {
    await syncPublishJobs([])

    expect(mockServerClient.from).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('never throws when the database read fails', async () => {
    const qb = createMockQueryBuilder({ data: null, error: { message: 'boom' } })
    mockServerClient.from.mockReturnValue(qb)

    await expect(syncPublishJobs(['pin-1'])).resolves.toBeDefined()
  })
})
