import { fetchUser, exchangeCodeFn, signOutFn } from './auth'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockServerClient } = vi.hoisted(() => ({
  mockServerClient: {
    from: vi.fn(),
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: { sub: 'user-1', email: 'test@example.com' },
        },
        error: null,
      }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: [{ tenant_id: 'tenant-1' }],
      error: null,
    }),
  },
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
}))

beforeEach(() => {
  // Reset call history so per-test "was/was not called" assertions are isolated.
  // Default implementations (set via mockResolvedValue above) survive clearAllMocks.
  vi.clearAllMocks()
})

// ─── fetchUser ───────────────────────────────────────────────────

describe('fetchUser', () => {
  it('returns user with profile data on success', async () => {
    const profileQb = createMockQueryBuilder({
      data: { tenant_id: 'tenant-1', display_name: 'Test User' },
    })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await fetchUser({})

    expect(result).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      tenant_id: 'tenant-1',
      display_name: 'Test User',
    })
  })

  it('verifies the JWT via getClaims (not the remote getUser)', async () => {
    const profileQb = createMockQueryBuilder({
      data: { tenant_id: 'tenant-1', display_name: 'Test User' },
    })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    await fetchUser({})

    expect(mockServerClient.auth.getClaims).toHaveBeenCalled()
  })

  it('does not call ensure_profile_exists on the resolver path', async () => {
    const profileQb = createMockQueryBuilder({
      data: { tenant_id: 'tenant-1', display_name: 'Test User' },
    })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    await fetchUser({})

    expect(mockServerClient.rpc).not.toHaveBeenCalled()
  })

  it('returns null when getClaims errors', async () => {
    mockServerClient.auth.getClaims.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid JWT' },
    })

    const result = await fetchUser({})
    expect(result).toBeNull()
  })

  it('returns null when there are no claims', async () => {
    mockServerClient.auth.getClaims.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    const result = await fetchUser({})
    expect(result).toBeNull()
  })

  it('resolves tenant_id and display_name from the profile row', async () => {
    const profileQb = createMockQueryBuilder({
      data: { tenant_id: 'tenant-xyz', display_name: 'Jane' },
    })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await fetchUser({})

    expect(result?.tenant_id).toBe('tenant-xyz')
    expect(result?.display_name).toBe('Jane')
  })

  it('falls back to email prefix when display_name is null', async () => {
    const profileQb = createMockQueryBuilder({
      data: { tenant_id: 'tenant-1', display_name: null },
    })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await fetchUser({})

    expect(result?.display_name).toBe('test')
  })

  it('falls back to empty tenant_id when the profile row is missing', async () => {
    const profileQb = createMockQueryBuilder({ data: null })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await fetchUser({})

    expect(result?.tenant_id).toBe('')
    expect(result?.display_name).toBe('test')
  })
})

// ─── exchangeCodeFn ──────────────────────────────────────────────

describe('exchangeCodeFn', () => {
  it('exchanges code for session successfully', async () => {
    const result = await exchangeCodeFn({ data: { code: 'auth-code' } })
    expect(result).toEqual({ error: null })
    expect(mockServerClient.auth.exchangeCodeForSession).toHaveBeenCalledWith('auth-code')
  })

  it('provisions the profile once at login', async () => {
    await exchangeCodeFn({ data: { code: 'auth-code' } })
    expect(mockServerClient.rpc).toHaveBeenCalledWith('ensure_profile_exists')
  })

  it('returns error when exchange fails', async () => {
    mockServerClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: 'Invalid code' },
    })

    const result = await exchangeCodeFn({ data: { code: 'bad-code' } })
    expect(result).toEqual({ error: 'Invalid code' })
  })

  it('does not provision a profile when the exchange fails', async () => {
    mockServerClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: 'Invalid code' },
    })

    await exchangeCodeFn({ data: { code: 'bad-code' } })
    expect(mockServerClient.rpc).not.toHaveBeenCalled()
  })

  it('still establishes the session when profile provisioning fails', async () => {
    mockServerClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failed' },
    })

    const result = await exchangeCodeFn({ data: { code: 'auth-code' } })
    expect(result).toEqual({ error: null })
  })
})

// ─── signOutFn ───────────────────────────────────────────────────

describe('signOutFn', () => {
  it('signs out successfully', async () => {
    const result = await signOutFn({})
    expect(result).toEqual({ error: null })
    expect(mockServerClient.auth.signOut).toHaveBeenCalled()
  })

  it('returns error when sign out fails', async () => {
    mockServerClient.auth.signOut.mockResolvedValueOnce({
      error: { message: 'Sign out failed' },
    })

    const result = await signOutFn({})
    expect(result).toEqual({ error: 'Sign out failed' })
  })
})
