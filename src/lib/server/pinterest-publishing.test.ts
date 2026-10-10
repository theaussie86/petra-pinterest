import { publishSinglePin, publishPinFn, publishPinsBulkFn } from './pinterest-publishing'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockCreatePinterestPin, mockEnqueueManual, mockServerClient, mockServiceClient } = vi.hoisted(() => ({
  mockEnqueueManual: vi.fn().mockResolvedValue({ status: 'enqueued' }),
  mockCreatePinterestPin: vi.fn().mockResolvedValue({ id: 'pinterest-pin-123' }),
  mockServerClient: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  },
  mockServiceClient: {
    rpc: vi.fn(),
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
  getSupabaseServiceClient: () => mockServiceClient,
}))

vi.mock('./mq', () => ({
  enqueueManualPublishPin: (...args: any[]) => mockEnqueueManual(...args),
}))

vi.mock('./pinterest-api', () => ({
  createPinterestPin: (...args: any[]) => mockCreatePinterestPin(...args),
}))

// publishSinglePin uses process.env.SUPABASE_URL for image URLs
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co'
})

function createMockClients() {
  return {
    supabase: {
      from: vi.fn(),
    },
    serviceClient: {
      rpc: vi.fn(),
    },
  }
}

function buildPinWithRelations(overrides: Record<string, any> = {}) {
  return {
    id: 'pin-1',
    image_path: 'tenant/image.png',
    pinterest_board_id: 'board-123',
    title: 'Pin Title',
    description: 'Pin description',
    alt_text: 'Alt text for pin',
    blog_articles: { url: 'https://blog.com/post' },
    blog_projects: { pinterest_connection_id: 'conn-1' },
    ...overrides,
  }
}

describe('publishSinglePin()', () => {
  it('publishes a pin: fetches, validates, calls Pinterest API, updates status', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations()
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)     // fetch pin
      .mockReturnValueOnce(successUpdateQb as any) // update with published status

    serviceClient.rpc.mockResolvedValueOnce({ data: 'access-token-123', error: null })

    const result = await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    expect(result).toEqual({ success: true, pinterest_pin_id: 'pinterest-pin-123' })
    expect(fetchQb.eq).toHaveBeenCalledWith('id', 'pin-1')
    expect(serviceClient.rpc).toHaveBeenCalledWith('get_pinterest_access_token', {
      p_connection_id: 'conn-1',
    })
    expect(mockCreatePinterestPin).toHaveBeenCalledWith('access-token-123', expect.objectContaining({
      board_id: 'board-123',
      title: 'Pin Title',
      description: 'Pin description',
      alt_text: 'Alt text for pin',
      link: 'https://blog.com/post',
      media_source: {
        source_type: 'image_url',
        url: 'https://test.supabase.co/storage/v1/object/public/pin-images/tenant/image.png',
      },
    }))
    expect(successUpdateQb.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'published',
      pinterest_pin_id: 'pinterest-pin-123',
    }))
  })

  it('sends ai_disclosures with AI_MODIFIED when ai_modified is set (default case)', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({ ai_modified: true, synthetic_performer: false })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(successUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    const payload = mockCreatePinterestPin.mock.calls[0][1]
    expect(payload.ai_disclosures).toEqual({ values: ['AI_MODIFIED'] })
  })

  it('sends both disclosure values when synthetic_performer is set', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({ ai_modified: true, synthetic_performer: true })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(successUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    const payload = mockCreatePinterestPin.mock.calls[0][1]
    expect(payload.ai_disclosures).toEqual({
      values: ['AI_MODIFIED', 'SYNTHETIC_PERFORMER'],
    })
  })

  it('omits ai_disclosures when both disclosure booleans are false', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({ ai_modified: false, synthetic_performer: false })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(successUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    const payload = mockCreatePinterestPin.mock.calls[0][1]
    expect(payload.ai_disclosures).toBeUndefined()
  })

  it('returns error when pin has no board assigned', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({ pinterest_board_id: null })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const errorUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(errorUpdateQb as any)

    const result = await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Pinterest board assigned')
    expect(errorUpdateQb.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
    }))
  })

  it('returns error when no Pinterest connection exists', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({
      blog_projects: { pinterest_connection_id: null },
    })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const errorUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(errorUpdateQb as any)

    const result = await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Pinterest account connected')
  })

  it('returns error when pin has no image', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({ image_path: null })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const errorUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(errorUpdateQb as any)

    const result = await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('must have an image')
  })

  it('returns error when Pinterest API call fails', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations()
    const fetchQb = createMockQueryBuilder({ data: pin })
    const errorUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(errorUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })
    mockCreatePinterestPin.mockRejectedValueOnce(new Error('Rate limit exceeded'))

    const result = await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Rate limit exceeded')
    expect(errorUpdateQb.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      error_message: 'Rate limit exceeded',
    }))
  })

  it('omits link when pin has no article and no alternate_url', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({ blog_articles: null, alternate_url: null })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(successUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    const payload = mockCreatePinterestPin.mock.calls[0][1]
    expect(payload.link).toBeUndefined()
  })

  it('uses alternate_url as link when article has no url', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({ blog_articles: null, alternate_url: 'https://custom.com/page' })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(successUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    const payload = mockCreatePinterestPin.mock.calls[0][1]
    expect(payload.link).toBe('https://custom.com/page')
  })

  it('prefers alternate_url over blog_articles url', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({ alternate_url: 'https://override.com' })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(successUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    const payload = mockCreatePinterestPin.mock.calls[0][1]
    expect(payload.link).toBe('https://override.com')
  })

  it('truncates title to 100 chars and description to 800 chars', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({
      title: 'A'.repeat(150),
      description: 'B'.repeat(1000),
      alt_text: 'C'.repeat(600),
    })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(successUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    const payload = mockCreatePinterestPin.mock.calls[0][1]
    expect(payload.title).toHaveLength(100)
    expect(payload.description).toHaveLength(800)
    expect(payload.alt_text).toHaveLength(500)
  })
})

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
