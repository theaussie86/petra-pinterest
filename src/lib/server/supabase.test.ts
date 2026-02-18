import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'

const { mockCreateServerClient, mockCreateClient, mockGetCookies, mockSetCookie } = vi.hoisted(() => ({
  mockCreateServerClient: vi.fn().mockReturnValue({ from: vi.fn() }),
  mockCreateClient: vi.fn().mockReturnValue({ from: vi.fn() }),
  mockGetCookies: vi.fn().mockReturnValue({ 'sb-token': 'abc123' }),
  mockSetCookie: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: any[]) => mockCreateServerClient(...args),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: any[]) => mockCreateClient(...args),
}))

vi.mock('@tanstack/react-start/server', () => ({
  getCookies: () => mockGetCookies(),
  setCookie: (...args: any[]) => mockSetCookie(...args),
}))

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-anon-key'
  process.env.SUPABASE_SECRET_KEY = 'test-service-key'
})

describe('getSupabaseServerClient', () => {
  it('creates a server client with correct URL and key', () => {
    getSupabaseServerClient()

    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    )
  })

  it('cookie adapter getAll reads from getCookies', () => {
    getSupabaseServerClient()

    const cookieConfig = mockCreateServerClient.mock.calls[0][2]
    const result = cookieConfig.cookies.getAll()

    expect(result).toEqual([{ name: 'sb-token', value: 'abc123' }])
  })

  it('cookie adapter setAll calls setCookie for each cookie', () => {
    getSupabaseServerClient()

    const cookieConfig = mockCreateServerClient.mock.calls[0][2]
    cookieConfig.cookies.setAll([
      { name: 'cookie1', value: 'val1', options: { path: '/' } },
      { name: 'cookie2', value: 'val2', options: {} },
    ])

    expect(mockSetCookie).toHaveBeenCalledTimes(2)
    expect(mockSetCookie).toHaveBeenCalledWith('cookie1', 'val1', { path: '/' })
    expect(mockSetCookie).toHaveBeenCalledWith('cookie2', 'val2', {})
  })
})

describe('getSupabaseServiceClient', () => {
  it('creates a service client with URL and secret key', () => {
    getSupabaseServiceClient()

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-key',
    )
  })
})
