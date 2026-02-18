import { vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key')

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ from: vi.fn() })),
}))

describe('supabase browser client', () => {
  it('exports a supabase client instance', async () => {
    const mod = await import('./supabase')
    expect(mod.supabase).toBeDefined()
    expect(typeof mod.supabase).toBe('object')
  })
})
