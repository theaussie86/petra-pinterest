import { QueryClient, QueryCache } from '@tanstack/react-query'
import { isAuthError } from './is-auth-error'

/**
 * Builds the app's QueryClient.
 *
 * Created per request inside the router factory (never a module singleton) so
 * no cache bleeds between users during SSR. A global `QueryCache.onError`
 * inspects every failed query: when `isAuthError` matches a session-expiry
 * error (`401` / PostgREST "JWT expired"), `onAuthError` fires so the app can
 * redirect to `/login`. This is the security backstop that makes skipping
 * per-navigation re-verification safe — a session that expires while the
 * cached user is still in memory is caught on the next protected data request.
 */
export function createQueryClient(onAuthError?: () => void) {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isAuthError(error)) {
          onAuthError?.()
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
    },
  })
}
