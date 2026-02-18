import { signInWithGoogle, signOut, ensureProfile } from './auth'

const { mockSupabase, mockSignOutFn } = vi.hoisted(() => ({
  mockSupabase: {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/...' },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: [{ tenant_id: 'tenant-1' }],
      error: null,
    }),
  },
  mockSignOutFn: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
}))

vi.mock('@/lib/server/auth', () => ({
  signOutFn: (...args: any[]) => mockSignOutFn(...args),
}))

// ─── signInWithGoogle ────────────────────────────────────────────

describe('signInWithGoogle', () => {
  it('calls signInWithOAuth with google provider', async () => {
    const result = await signInWithGoogle()

    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringContaining('/auth/callback'),
      },
    })
    expect(result).toEqual({ url: 'https://accounts.google.com/...' })
  })

  it('throws when OAuth fails', async () => {
    mockSupabase.auth.signInWithOAuth.mockResolvedValueOnce({
      data: null,
      error: new Error('OAuth provider error'),
    })

    await expect(signInWithGoogle()).rejects.toThrow('OAuth provider error')
  })
})

// ─── signOut ─────────────────────────────────────────────────────

describe('signOut', () => {
  it('calls signOutFn server function', async () => {
    await signOut()
    expect(mockSignOutFn).toHaveBeenCalled()
  })
})

// ─── ensureProfile ───────────────────────────────────────────────

describe('ensureProfile', () => {
  it('returns tenant_id from RPC result', async () => {
    const result = await ensureProfile()
    expect(result).toEqual({ tenant_id: 'tenant-1' })
    expect(mockSupabase.rpc).toHaveBeenCalledWith('ensure_profile_exists')
  })

  it('throws when RPC returns error', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failed' },
    })

    await expect(ensureProfile()).rejects.toThrow('Unable to resolve user profile')
  })

  it('throws when RPC returns empty array', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    await expect(ensureProfile()).rejects.toThrow('Unable to resolve user profile')
  })

  it('throws when RPC returns null data', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    await expect(ensureProfile()).rejects.toThrow('Unable to resolve user profile')
  })
})
