import { userQueryOptions, USER_QUERY_KEY } from './user'

const { mockFetchUser } = vi.hoisted(() => ({
  mockFetchUser: vi.fn(),
}))

vi.mock('@/lib/server/auth', () => ({
  fetchUser: (...args: any[]) => mockFetchUser(...args),
}))

describe('userQueryOptions', () => {
  it('uses the stable ["user"] query key', () => {
    expect(userQueryOptions().queryKey).toEqual(USER_QUERY_KEY)
    expect(USER_QUERY_KEY).toEqual(['user'])
  })

  it('sets a ~5 minute staleTime so navigations reuse the cached user', () => {
    expect(userQueryOptions().staleTime).toBe(5 * 60 * 1000)
  })

  it('resolves the user via the fetchUser server function', async () => {
    const user = {
      id: 'u1',
      email: 'a@b.com',
      tenant_id: 't1',
      display_name: 'A',
    }
    mockFetchUser.mockResolvedValueOnce(user)

    const result = await userQueryOptions().queryFn!({} as any)

    expect(mockFetchUser).toHaveBeenCalledTimes(1)
    expect(result).toEqual(user)
  })

  it('propagates a null user (signed out)', async () => {
    mockFetchUser.mockResolvedValueOnce(null)
    const result = await userQueryOptions().queryFn!({} as any)
    expect(result).toBeNull()
  })
})
