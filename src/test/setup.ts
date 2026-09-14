import { afterEach } from 'vitest'

// jsdom lacks ResizeObserver, which Radix UI primitives (e.g. Switch) call on
// mount. Provide a no-op polyfill so component tests can render them.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom does not implement scrollIntoView; the workshop template list calls it
// to keep the keyboard-selected row in view. Provide a no-op.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

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
