import { storeGeminiKeyFn, deleteGeminiKeyFn, getGeminiKeyStatusFn } from './gemini-key'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockServerClient, mockServiceClient } = vi.hoisted(() => ({
  mockServerClient: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
  },
  mockServiceClient: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
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

describe('storeGeminiKeyFn', () => {
  it('authenticates, verifies project ownership, stores key in Vault', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const projectQb = createMockQueryBuilder({ data: { id: 'proj-1' } })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
    mockServiceClient.rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await storeGeminiKeyFn({
      data: { blog_project_id: 'proj-1', api_key: 'test-key-123' },
    })

    expect(result).toEqual({ success: true })
    expect(mockServerClient.auth.getUser).toHaveBeenCalled()
    expect(profileQb.eq).toHaveBeenCalledWith('id', 'test-user-id')
    expect(projectQb.eq).toHaveBeenCalledWith('id', 'proj-1')
    expect(projectQb.eq).toHaveBeenCalledWith('tenant_id', 'test-tenant-id')
    expect(mockServiceClient.rpc).toHaveBeenCalledWith('store_gemini_api_key', {
      p_blog_project_id: 'proj-1',
      p_api_key: 'test-key-123',
    })
  })

  it('throws when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    await expect(
      storeGeminiKeyFn({ data: { blog_project_id: 'proj-1', api_key: 'key' } }),
    ).rejects.toThrow('Not authenticated')
  })

  it('throws when project not found', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const projectQb = createMockQueryBuilder({ data: null, error: { message: 'not found' } })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    await expect(
      storeGeminiKeyFn({ data: { blog_project_id: 'bad-id', api_key: 'key' } }),
    ).rejects.toThrow('Blog project not found or access denied')
  })

  it('throws when Vault RPC fails', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const projectQb = createMockQueryBuilder({ data: { id: 'proj-1' } })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
    mockServiceClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'vault error' } })

    await expect(
      storeGeminiKeyFn({ data: { blog_project_id: 'proj-1', api_key: 'key' } }),
    ).rejects.toThrow('Failed to store API key')
  })
})

describe('deleteGeminiKeyFn', () => {
  it('authenticates, verifies project, deletes key from Vault', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const projectQb = createMockQueryBuilder({ data: { id: 'proj-1' } })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
    mockServiceClient.rpc.mockResolvedValueOnce({ data: null, error: null })

    const result = await deleteGeminiKeyFn({ data: { blog_project_id: 'proj-1' } })

    expect(result).toEqual({ success: true })
    expect(mockServiceClient.rpc).toHaveBeenCalledWith('delete_gemini_api_key', {
      p_blog_project_id: 'proj-1',
    })
  })
})

describe('getGeminiKeyStatusFn', () => {
  it('returns has_key: true when key exists', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const projectQb = createMockQueryBuilder({ data: { id: 'proj-1' } })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
    mockServiceClient.rpc.mockResolvedValueOnce({ data: true, error: null })

    const result = await getGeminiKeyStatusFn({ data: { blog_project_id: 'proj-1' } })

    expect(result).toEqual({ has_key: true })
  })

  it('returns has_key: false when no key', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'test-tenant-id' } })
    const projectQb = createMockQueryBuilder({ data: { id: 'proj-1' } })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
    mockServiceClient.rpc.mockResolvedValueOnce({ data: false, error: null })

    const result = await getGeminiKeyStatusFn({ data: { blog_project_id: 'proj-1' } })

    expect(result).toEqual({ has_key: false })
  })
})
