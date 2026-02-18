import { fetchPinterestBoardsFn } from './pinterest-boards'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockServerClient, mockServiceClient, mockFetchPinterestBoards } = vi.hoisted(() => ({
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
    rpc: vi.fn().mockResolvedValue({ data: 'access-token', error: null }),
  },
  mockFetchPinterestBoards: vi.fn().mockResolvedValue([]),
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
  fetchPinterestBoards: (...args: any[]) => mockFetchPinterestBoards(...args),
}))

describe('fetchPinterestBoardsFn', () => {
  it('returns boards on success', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: 'conn-1' } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    mockFetchPinterestBoards.mockResolvedValueOnce([
      { id: 'b1', name: 'Recipes', description: '', privacy: 'PUBLIC', pin_count: 10 },
      { id: 'b2', name: 'DIY', description: '', privacy: 'PUBLIC', pin_count: 5 },
    ])

    const result = await fetchPinterestBoardsFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: true,
      boards: [
        { pinterest_board_id: 'b1', name: 'Recipes' },
        { pinterest_board_id: 'b2', name: 'DIY' },
      ],
    })
  })

  it('returns error when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    const result = await fetchPinterestBoardsFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Not authenticated',
      boards: [],
    })
  })

  it('returns error when profile not found', async () => {
    const profileQb = createMockQueryBuilder({ data: null, error: { message: 'Not found' } })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await fetchPinterestBoardsFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Profile not found',
      boards: [],
    })
  })

  it('returns error when project not found', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: null, error: { message: 'Not found' } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    const result = await fetchPinterestBoardsFn({
      data: { blog_project_id: 'bad-proj' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Blog project not found or access denied',
      boards: [],
    })
  })

  it('returns error when no Pinterest connection', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: null } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    const result = await fetchPinterestBoardsFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: false,
      error: 'No Pinterest account connected',
      boards: [],
    })
  })

  it('returns error when Vault token retrieval fails', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: 'conn-1' } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    mockServiceClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Vault error' } })

    const result = await fetchPinterestBoardsFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Could not retrieve access token',
      boards: [],
    })
  })

  it('returns error when Pinterest API throws', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: 'conn-1' } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    mockServiceClient.rpc.mockResolvedValueOnce({ data: 'token', error: null })
    mockFetchPinterestBoards.mockRejectedValueOnce(new Error('API timeout'))

    const result = await fetchPinterestBoardsFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: false,
      error: 'API timeout',
      boards: [],
    })
  })
})
