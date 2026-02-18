import {
  initPinterestOAuthFn,
  exchangePinterestCallbackFn,
  disconnectPinterestFn,
  getPinterestConnectionFn,
} from './pinterest-oauth'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const {
  mockServerClient,
  mockServiceClient,
  mockExchangePinterestCode,
  mockFetchPinterestUser,
  mockGenerateCodeVerifier,
  mockGenerateCodeChallenge,
  mockGenerateState,
} = vi.hoisted(() => ({
  mockServerClient: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
  mockServiceClient: {
    rpc: vi.fn(),
  },
  mockExchangePinterestCode: vi.fn(),
  mockFetchPinterestUser: vi.fn(),
  mockGenerateCodeVerifier: vi.fn().mockReturnValue('test-verifier'),
  mockGenerateCodeChallenge: vi.fn().mockResolvedValue('test-challenge'),
  mockGenerateState: vi.fn().mockReturnValue('test-state'),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: (validator: any) => ({
      handler: (handler: any) => (input: any) => handler({ data: validator(input.data) }),
    }),
    handler: (handler: any) => (input: any) => handler({ data: input?.data }),
  }),
}))

vi.mock('./supabase', () => ({
  getSupabaseServerClient: () => mockServerClient,
  getSupabaseServiceClient: () => mockServiceClient,
}))

vi.mock('./pinterest-api', () => ({
  exchangePinterestCode: (...args: any[]) => mockExchangePinterestCode(...args),
  fetchPinterestUser: (...args: any[]) => mockFetchPinterestUser(...args),
  generateCodeVerifier: () => mockGenerateCodeVerifier(),
  generateCodeChallenge: (...args: any[]) => mockGenerateCodeChallenge(...args),
  generateState: () => mockGenerateState(),
}))

// Env vars for OAuth config
beforeAll(() => {
  process.env.PINTEREST_APP_ID = 'test-app-id'
  process.env.PINTEREST_REDIRECT_URI = 'http://localhost:3000/auth/pinterest/callback'
})

// Reset mocks that accumulate once-values between tests
beforeEach(() => {
  mockServerClient.from.mockReset()
  mockServerClient.auth.getUser.mockReset()
  mockServerClient.auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  })
  mockServiceClient.rpc.mockReset()
  mockServiceClient.rpc.mockResolvedValue({ data: null, error: null })
  mockExchangePinterestCode.mockReset()
  mockFetchPinterestUser.mockReset()
})

// ─── initPinterestOAuthFn ────────────────────────────────────────

describe('initPinterestOAuthFn', () => {
  it('returns auth URL on success', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { id: 'proj-1' } })
    const insertQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
      .mockReturnValueOnce(insertQb as any)

    const result = await initPinterestOAuthFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result.success).toBe(true)
    expect((result as any).authUrl).toContain('https://www.pinterest.com/oauth/')
    expect((result as any).authUrl).toContain('client_id=test-app-id')
    expect((result as any).authUrl).toContain('state=test-state')
  })

  it('returns error when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    const result = await initPinterestOAuthFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns error when profile not found', async () => {
    const profileQb = createMockQueryBuilder({ data: null, error: { message: 'Not found' } })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await initPinterestOAuthFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: false, error: 'Profile not found' })
  })

  it('returns error when project not found', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: null, error: { message: 'Not found' } })
    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    const result = await initPinterestOAuthFn({
      data: { blog_project_id: 'bad-proj' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Blog project not found or access denied',
    })
  })

  it('returns error when state insert fails', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { id: 'proj-1' } })
    const insertQb = createMockQueryBuilder({ error: { message: 'Insert failed' } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
      .mockReturnValueOnce(insertQb as any)

    const result = await initPinterestOAuthFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Failed to initialize OAuth flow',
    })
  })

  it('returns error when OAuth env vars are not configured', async () => {
    const origAppId = process.env.PINTEREST_APP_ID
    delete process.env.PINTEREST_APP_ID

    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { id: 'proj-1' } })
    const insertQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
      .mockReturnValueOnce(insertQb as any)

    const result = await initPinterestOAuthFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Pinterest OAuth not configured',
    })

    process.env.PINTEREST_APP_ID = origAppId
  })
})

// ─── exchangePinterestCallbackFn ─────────────────────────────────

describe('exchangePinterestCallbackFn', () => {
  const stateRow = {
    id: 'state-row-1',
    state: 'test-state',
    code_verifier: 'verifier-123',
    blog_project_id: 'proj-1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    expires_at: new Date(Date.now() + 600000).toISOString(), // 10 min from now
  }

  function setupTokenMocks() {
    mockExchangePinterestCode.mockResolvedValueOnce({
      access_token: 'acc-token',
      refresh_token: 'ref-token',
      expires_in: 2592000,
      scope: 'user_accounts:read',
    })
    mockFetchPinterestUser.mockResolvedValueOnce({
      id: 'pinterest-user-1',
      username: 'pinner',
    })
  }

  it('exchanges code and creates new connection', async () => {
    const stateQb = createMockQueryBuilder({ data: stateRow })
    const existingConnQb = createMockQueryBuilder({ data: null, error: { code: 'PGRST116' } })
    const newConnQb = createMockQueryBuilder({ data: { id: 'conn-new' } })
    const projectUpdateQb = createMockQueryBuilder({ data: null })
    const deleteStateQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(stateQb as any)
      .mockReturnValueOnce(existingConnQb as any)
      .mockReturnValueOnce(newConnQb as any)
      .mockReturnValueOnce(projectUpdateQb as any)
      .mockReturnValueOnce(deleteStateQb as any)

    setupTokenMocks()

    const result = await exchangePinterestCallbackFn({
      data: { code: 'auth-code', state: 'test-state' },
    })

    expect(result).toEqual({
      success: true,
      blog_project_id: 'proj-1',
      pinterest_username: 'pinner',
    })
  })

  it('returns error when state is invalid', async () => {
    const stateQb = createMockQueryBuilder({ data: null, error: { message: 'Not found' } })
    mockServerClient.from.mockReturnValueOnce(stateQb as any)

    const result = await exchangePinterestCallbackFn({
      data: { code: 'auth-code', state: 'invalid-state' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Invalid or expired state',
    })
  })

  it('returns error when state has expired', async () => {
    const expiredState = {
      ...stateRow,
      expires_at: new Date(Date.now() - 60000).toISOString(), // expired
    }
    const stateQb = createMockQueryBuilder({ data: expiredState })
    const deleteQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(stateQb as any)
      .mockReturnValueOnce(deleteQb as any)

    const result = await exchangePinterestCallbackFn({
      data: { code: 'auth-code', state: 'test-state' },
    })

    expect(result).toEqual({ success: false, error: 'OAuth state expired' })
  })

  it('updates existing connection when one exists', async () => {
    const stateQb = createMockQueryBuilder({ data: stateRow })
    const existingConnQb = createMockQueryBuilder({ data: { id: 'conn-existing' } })
    const updateConnQb = createMockQueryBuilder({ data: null })
    const projectUpdateQb = createMockQueryBuilder({ data: null })
    const deleteStateQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(stateQb as any)
      .mockReturnValueOnce(existingConnQb as any)
      .mockReturnValueOnce(updateConnQb as any)
      .mockReturnValueOnce(projectUpdateQb as any)
      .mockReturnValueOnce(deleteStateQb as any)

    setupTokenMocks()

    const result = await exchangePinterestCallbackFn({
      data: { code: 'auth-code', state: 'test-state' },
    })

    expect(result.success).toBe(true)
    expect(mockServiceClient.rpc).toHaveBeenCalledWith('store_pinterest_tokens', {
      p_connection_id: 'conn-existing',
      p_access_token: 'acc-token',
      p_refresh_token: 'ref-token',
    })
  })

  it('returns error when vault storage fails', async () => {
    const stateQb = createMockQueryBuilder({ data: stateRow })
    const existingConnQb = createMockQueryBuilder({ data: null, error: { code: 'PGRST116' } })
    const newConnQb = createMockQueryBuilder({ data: { id: 'conn-new' } })
    // Cleanup in catch block calls from() once more
    const cleanupQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(stateQb as any)
      .mockReturnValueOnce(existingConnQb as any)
      .mockReturnValueOnce(newConnQb as any)
      .mockReturnValueOnce(cleanupQb as any)

    setupTokenMocks()
    mockServiceClient.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Vault error' } })

    const result = await exchangePinterestCallbackFn({
      data: { code: 'auth-code', state: 'test-state' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Failed to store tokens in Vault',
    })
  })
})

// ─── disconnectPinterestFn ───────────────────────────────────────

describe('disconnectPinterestFn', () => {
  it('disconnects and deletes connection when no other projects use it', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: 'conn-1' } })
    const unlinkQb = createMockQueryBuilder({ data: null })
    const otherProjectsQb = createMockQueryBuilder({ data: [] })
    const deleteConnQb = createMockQueryBuilder({ data: null })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
      .mockReturnValueOnce(unlinkQb as any)
      .mockReturnValueOnce(otherProjectsQb as any)
      .mockReturnValueOnce(deleteConnQb as any)

    const result = await disconnectPinterestFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: true })
    expect(mockServiceClient.rpc).toHaveBeenCalledWith('delete_pinterest_tokens', {
      p_connection_id: 'conn-1',
    })
  })

  it('returns error when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    const result = await disconnectPinterestFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('succeeds when already disconnected (no connection_id)', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: null } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    const result = await disconnectPinterestFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: true })
  })

  it('keeps connection when other projects still use it', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: 'conn-1' } })
    const unlinkQb = createMockQueryBuilder({ data: null })
    const otherProjectsQb = createMockQueryBuilder({ data: [{ id: 'proj-2' }] })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
      .mockReturnValueOnce(unlinkQb as any)
      .mockReturnValueOnce(otherProjectsQb as any)

    const result = await disconnectPinterestFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: true })
    // Should NOT delete tokens since another project uses the connection
    expect(mockServiceClient.rpc).not.toHaveBeenCalledWith(
      'delete_pinterest_tokens',
      expect.anything(),
    )
  })

  it('returns error when project not found', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: null, error: { message: 'Not found' } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    const result = await disconnectPinterestFn({
      data: { blog_project_id: 'bad-proj' },
    })

    expect(result).toEqual({
      success: false,
      error: 'Blog project not found or access denied',
    })
  })
})

// ─── getPinterestConnectionFn ────────────────────────────────────

describe('getPinterestConnectionFn', () => {
  it('returns connection info when connected', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: 'conn-1' } })
    const connectionQb = createMockQueryBuilder({
      data: {
        id: 'conn-1',
        pinterest_username: 'pinner',
        is_active: true,
        last_error: null,
        token_expires_at: '2025-06-01T00:00:00Z',
      },
    })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
      .mockReturnValueOnce(connectionQb as any)

    const result = await getPinterestConnectionFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({
      success: true,
      connected: true,
      connection: {
        id: 'conn-1',
        pinterest_username: 'pinner',
        is_active: true,
        last_error: null,
        token_expires_at: '2025-06-01T00:00:00Z',
      },
    })
  })

  it('returns not connected when no pinterest_connection_id', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: null } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)

    const result = await getPinterestConnectionFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: true, connected: false })
  })

  it('returns not connected when connection row is missing', async () => {
    const profileQb = createMockQueryBuilder({ data: { tenant_id: 'tenant-1' } })
    const projectQb = createMockQueryBuilder({ data: { pinterest_connection_id: 'conn-deleted' } })
    const connectionQb = createMockQueryBuilder({ data: null, error: { code: 'PGRST116' } })

    mockServerClient.from
      .mockReturnValueOnce(profileQb as any)
      .mockReturnValueOnce(projectQb as any)
      .mockReturnValueOnce(connectionQb as any)

    const result = await getPinterestConnectionFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: true, connected: false })
  })

  it('returns error when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    const result = await getPinterestConnectionFn({
      data: { blog_project_id: 'proj-1' },
    })

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })
})
