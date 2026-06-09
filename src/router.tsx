import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { createQueryClient } from './lib/query/client'

export function getRouter() {
  // Per-request QueryClient (created fresh each time the router is built) so no
  // cache bleeds between users during SSR. Holds the cached authed user and is
  // shared with route loaders via `context`.
  let router: ReturnType<typeof createTanStackRouter>
  const queryClient = createQueryClient(() => {
    // Session expired while the app was open: bounce to login on the next
    // failed protected data request.
    router?.navigate({ to: '/login' })
  })

  router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
  })

  // TanStack Start + Query SSR integration: dehydrates the per-request
  // QueryClient on the server and hydrates it on the client, so data a loader
  // prefetched via `ensureQueryData` arrives in the SSR HTML and rehydrates
  // without a client refetch. `wrapQueryClient` supplies the
  // QueryClientProvider to the whole tree, replacing the former manual `Wrap`
  // provider (and the removed module-singleton QueryClient + provider in
  // __root.tsx). The auth `onError` redirect and `['user']` caching on the
  // per-request client are preserved.
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    wrapQueryClient: true,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
