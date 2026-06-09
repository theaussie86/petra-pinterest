import { QueryCache } from '@tanstack/react-query'
import { createQueryClient } from './client'

describe('createQueryClient', () => {
  it('invokes onAuthError when a query fails with an auth error', () => {
    const onAuthError = vi.fn()
    const client = createQueryClient(onAuthError)
    const cache = client.getQueryCache() as QueryCache

    // Simulate a failed query carrying a session-expiry error.
    cache.config.onError?.(
      { status: 401, message: 'JWT expired' } as any,
      {} as any,
    )

    expect(onAuthError).toHaveBeenCalledTimes(1)
  })

  it('does not invoke onAuthError for ordinary data errors', () => {
    const onAuthError = vi.fn()
    const client = createQueryClient(onAuthError)
    const cache = client.getQueryCache() as QueryCache

    cache.config.onError?.(new Error('boom') as any, {} as any)

    expect(onAuthError).not.toHaveBeenCalled()
  })

  it('tolerates being created without an onAuthError callback', () => {
    const client = createQueryClient()
    const cache = client.getQueryCache() as QueryCache
    expect(() =>
      cache.config.onError?.({ status: 401 } as any, {} as any),
    ).not.toThrow()
  })
})
