import { afterEach } from 'vitest'

// Stub import.meta.env for modules that read Supabase config at import time
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
  },
  writable: true,
})

afterEach(() => {
  vi.clearAllMocks()
})
