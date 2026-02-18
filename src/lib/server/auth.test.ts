import { fetchUser, exchangeCodeFn, signOutFn } from './auth'
import { createMockQueryBuilder } from '@/test/mocks/supabase'

const { mockServerClient } = vi.hoisted(() => ({
  mockServerClient: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'test@example.com' } },
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

// ─── fetchUser ───────────────────────────────────────────────────

describe('fetchUser', () => {
  it('returns user with profile data on success', async () => {
    const profileQb = createMockQueryBuilder({
      data: { display_name: 'Test User' },
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

  it('returns null when not authenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    const result = await fetchUser({})
    expect(result).toBeNull()
  })

  it('falls back to email prefix when display_name is null', async () => {
    const profileQb = createMockQueryBuilder({ data: { display_name: null } })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await fetchUser({})

    expect(result?.display_name).toBe('test')
  })

  it('handles rpc error gracefully (empty tenant_id)', async () => {
    mockServerClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failed' },
    })

    const profileQb = createMockQueryBuilder({ data: { display_name: 'User' } })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await fetchUser({})

    expect(result?.tenant_id).toBe('')
    expect(result?.display_name).toBe('User')
  })

  it('handles rpc returning empty array (empty tenant_id)', async () => {
    mockServerClient.rpc.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    const profileQb = createMockQueryBuilder({ data: { display_name: 'User' } })
    mockServerClient.from.mockReturnValueOnce(profileQb as any)

    const result = await fetchUser({})

    expect(result?.tenant_id).toBe('')
  })
})

// ─── exchangeCodeFn ──────────────────────────────────────────────

describe('exchangeCodeFn', () => {
  it('exchanges code for session successfully', async () => {
    const result = await exchangeCodeFn({ data: { code: 'auth-code' } })
    expect(result).toEqual({ error: null })
    expect(mockServerClient.auth.exchangeCodeForSession).toHaveBeenCalledWith('auth-code')
  })

  it('returns error when exchange fails', async () => {
    mockServerClient.auth.exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: 'Invalid code' },
    })

    const result = await exchangeCodeFn({ data: { code: 'bad-code' } })
    expect(result).toEqual({ error: 'Invalid code' })
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
