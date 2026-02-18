import { publishSinglePin } from './pinterest-publishing'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockCreatePinterestPin } = vi.hoisted(() => ({
  mockCreatePinterestPin: vi.fn().mockResolvedValue({ id: 'pinterest-pin-123' }),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: any) => ({
      handler: (handler: any) => (input: any) => handler({ data: validator(input.data) }),
    }),
  }),
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
    const statusUpdateQb = createMockQueryBuilder({ data: null })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)     // fetch pin
      .mockReturnValueOnce(statusUpdateQb as any) // update status to publish_pin
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
    const statusUpdateQb = createMockQueryBuilder({ data: null })
    const errorUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(statusUpdateQb as any)
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

  it('truncates title to 100 chars and description to 800 chars', async () => {
    const { supabase, serviceClient } = createMockClients()

    const pin = buildPinWithRelations({
      title: 'A'.repeat(150),
      description: 'B'.repeat(1000),
      alt_text: 'C'.repeat(600),
    })
    const fetchQb = createMockQueryBuilder({ data: pin })
    const statusUpdateQb = createMockQueryBuilder({ data: null })
    const successUpdateQb = createMockQueryBuilder({ data: null })

    supabase.from
      .mockReturnValueOnce(fetchQb as any)
      .mockReturnValueOnce(statusUpdateQb as any)
      .mockReturnValueOnce(successUpdateQb as any)

    serviceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })

    await publishSinglePin(supabase as any, serviceClient as any, 'pin-1')

    const payload = mockCreatePinterestPin.mock.calls[0][1]
    expect(payload.title).toHaveLength(100)
    expect(payload.description).toHaveLength(800)
    expect(payload.alt_text).toHaveLength(500)
  })
})
