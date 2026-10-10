import { publishPinFn, publishPinsBulkFn } from './pinterest-publishing'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockEnqueueManual, mockServerClient } = vi.hoisted(() => ({
  mockEnqueueManual: vi.fn().mockResolvedValue({ status: 'enqueued' }),
  mockServerClient: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  },
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: any) => ({
      handler: (handler: any) => (input: any) => handler({ data: validator(input.data) }),
    }),
  }),
}))

vi.mock('./supabase', () => ({
  getSupabaseServerClient: () => mockServerClient,
}))

vi.mock('./mq', () => ({
  enqueueManualPublishPin: (...args: any[]) => mockEnqueueManual(...args),
}))

// ─── publishPinFn (MQ) ───────────────────────────────────────────

function buildQueueablePin(overrides: Record<string, any> = {}) {
  return {
    id: 'pin-1',
    tenant_id: 'tenant-1',
    status: 'error',
    scheduled_at: null,
    error_message: 'boom',
    pinterest_pin_id: null,
    pinterest_board_id: 'board-123',
    image_path: 'tenant/image.png',
    blog_projects: { pinterest_connection_id: 'conn-1' },
    ...overrides,
  }
}

describe('publishPinFn', () => {
  beforeEach(() => {
    mockEnqueueManual.mockClear()
    mockEnqueueManual.mockResolvedValue({ status: 'enqueued' })
  })

  it('prepares the pin as publish candidate and enqueues a manual job', async () => {
    const fetchQb = createMockQueryBuilder({ data: buildQueueablePin() })
    const prepareQb = createMockQueryBuilder({ data: null })
    mockServerClient.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(prepareQb as any)

    const result = await publishPinFn({ data: { pin_id: 'pin-1' } })

    expect(result).toEqual({ queued: true, pin_id: 'pin-1' })
    expect(prepareQb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'metadata_created',
        error_message: null,
        scheduled_at: expect.any(String),
      }),
    )
    const scheduledAt = prepareQb.update.mock.calls[0][0].scheduled_at
    expect(mockEnqueueManual).toHaveBeenCalledWith({
      pinId: 'pin-1',
      scheduledAt,
      tenantId: 'tenant-1',
    })
  })

  it('restores the pin and throws when enqueueing fails', async () => {
    mockEnqueueManual.mockResolvedValueOnce({
      status: 'error',
      error: { message: 'MQ down' },
    })
    const fetchQb = createMockQueryBuilder({ data: buildQueueablePin() })
    const prepareQb = createMockQueryBuilder({ data: null })
    const restoreQb = createMockQueryBuilder({ data: null })
    mockServerClient.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(prepareQb as any)
      .mockReturnValueOnce(restoreQb as any)

    await expect(publishPinFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow(
      'Publish queue unavailable: MQ down',
    )
    expect(restoreQb.update).toHaveBeenCalledWith({
      status: 'error',
      scheduled_at: null,
      error_message: 'boom',
    })
  })

  it.each([
    ['no board', { pinterest_board_id: null }, 'board'],
    ['no connection', { blog_projects: { pinterest_connection_id: null } }, 'Pinterest account'],
    ['no image', { image_path: null }, 'image'],
    ['already published', { pinterest_pin_id: 'p1', status: 'published' }, 'already published'],
  ])('rejects without enqueueing: %s', async (_name, overrides, message) => {
    const fetchQb = createMockQueryBuilder({ data: buildQueueablePin(overrides) })
    mockServerClient.from.mockReturnValueOnce(fetchQb as any)

    await expect(publishPinFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow(message)
    expect(mockEnqueueManual).not.toHaveBeenCalled()
  })

  it('throws when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    await expect(publishPinFn({ data: { pin_id: 'pin-1' } })).rejects.toThrow(
      'Not authenticated',
    )
  })

  it('throws when pin not found', async () => {
    const fetchQb = createMockQueryBuilder({ data: null, error: { message: 'Not found' } })
    mockServerClient.from.mockReturnValueOnce(fetchQb as any)

    await expect(publishPinFn({ data: { pin_id: 'bad-pin' } })).rejects.toThrow(
      'Pin not found or access denied',
    )
  })
})

// ─── publishPinsBulkFn (MQ) ─────────────────────────────────────

describe('publishPinsBulkFn', () => {
  beforeEach(() => {
    mockEnqueueManual.mockClear()
    mockEnqueueManual.mockResolvedValue({ status: 'enqueued' })
  })

  it('enqueues every pin without app-side delay and reports per-pin results', async () => {
    const accessQb = createMockQueryBuilder({ data: [{ id: 'pin-1' }, { id: 'pin-2' }] })
    mockServerClient.from
      .mockReturnValueOnce(accessQb as any)
      .mockReturnValueOnce(createMockQueryBuilder({ data: buildQueueablePin({ id: 'pin-1' }) }) as any)
      .mockReturnValueOnce(createMockQueryBuilder({ data: null }) as any)
      // pin-2 has no board -> fails validation
      .mockReturnValueOnce(
        createMockQueryBuilder({ data: buildQueueablePin({ id: 'pin-2', pinterest_board_id: null }) }) as any,
      )

    const result = await publishPinsBulkFn({ data: { pin_ids: ['pin-1', 'pin-2'] } })

    expect(result).toEqual({
      total: 2,
      queued: 1,
      failed: 1,
      results: [
        { id: 'pin-1', success: true },
        { id: 'pin-2', success: false, error: 'Pin must have a Pinterest board assigned' },
      ],
    })
    expect(mockEnqueueManual).toHaveBeenCalledTimes(1)
  })

  it('throws when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    await expect(
      publishPinsBulkFn({ data: { pin_ids: ['pin-1'] } }),
    ).rejects.toThrow('Not authenticated')
  })

  it('throws when some pins are not found', async () => {
    const accessQb = createMockQueryBuilder({ data: [{ id: 'pin-1' }] })
    mockServerClient.from.mockReturnValueOnce(accessQb as any)

    await expect(
      publishPinsBulkFn({ data: { pin_ids: ['pin-1', 'pin-2'] } }),
    ).rejects.toThrow('Some pins not found')
  })
})
