import { publishSinglePin, publishPinFn, publishPinsBulkFn } from './pinterest-publishing'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockCreatePinterestPin, mockServerClient, mockServiceClient } = vi.hoisted(() => ({
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

// ─── publishPinFn ────────────────────────────────────────────────

describe('publishPinFn', () => {
  it('authenticates and publishes a single pin', async () => {
    // Pin access check
    const pinAccessQb = createMockQueryBuilder({ data: { id: 'pin-1' } })
    // publishSinglePin internal calls: fetch pin, success update
    const pin = buildPinWithRelations()
    const fetchQb = createMockQueryBuilder({ data: pin })
    const successQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(pinAccessQb as any)
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(successQb as any)

    mockServiceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    const result = await publishPinFn({ data: { pin_id: 'pin-1' } })

    expect(result).toEqual({ success: true, pinterest_pin_id: 'pinterest-pin-123' })
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
    const pinAccessQb = createMockQueryBuilder({ data: null, error: { message: 'Not found' } })
    mockServerClient.from.mockReturnValueOnce(pinAccessQb as any)

    await expect(publishPinFn({ data: { pin_id: 'bad-pin' } })).rejects.toThrow(
      'Pin not found or access denied',
    )
  })
})

// ─── publishPinsBulkFn ──────────────────────────────────────────

describe('publishPinsBulkFn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes multiple pins sequentially with delays', async () => {
    // Pin access check — both pins exist
    const pinsAccessQb = createMockQueryBuilder({ data: [{ id: 'pin-1' }, { id: 'pin-2' }] })

    // publishSinglePin calls for pin-1
    const pin1 = buildPinWithRelations({ id: 'pin-1' })
    const fetch1 = createMockQueryBuilder({ data: pin1 })
    const success1 = createMockQueryBuilder({ data: null })

    // publishSinglePin calls for pin-2
    const pin2 = buildPinWithRelations({ id: 'pin-2' })
    const fetch2 = createMockQueryBuilder({ data: pin2 })
    const success2 = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(pinsAccessQb as any)
      .mockReturnValueOnce(fetch1 as any)
      .mockReturnValueOnce(success1 as any)
      .mockReturnValueOnce(fetch2 as any)
      .mockReturnValueOnce(success2 as any)

    mockServiceClient.rpc
      .mockResolvedValueOnce({ data: 'token', error: null })
      .mockResolvedValueOnce({ data: 'token', error: null })

    const promise = publishPinsBulkFn({
      data: { pin_ids: ['pin-1', 'pin-2'] },
    })

    // Advance past the 10s delay between pins
    await vi.advanceTimersByTimeAsync(15000)

    const result = await promise

    expect(result).toEqual({
      total: 2,
      published: 2,
      failed: 0,
      results: [
        { id: 'pin-1', success: true },
        { id: 'pin-2', success: true },
      ],
    })
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
    // Return only 1 pin when 2 were requested
    const pinsAccessQb = createMockQueryBuilder({ data: [{ id: 'pin-1' }] })
    mockServerClient.from.mockReturnValueOnce(pinsAccessQb as any)

    await expect(
      publishPinsBulkFn({ data: { pin_ids: ['pin-1', 'pin-2'] } }),
    ).rejects.toThrow('Some pins not found')
  })
})
