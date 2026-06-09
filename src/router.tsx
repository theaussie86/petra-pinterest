import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
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
    // Provide the per-request QueryClient to the whole tree. Replaces the
    // former module-singleton provider in __root.tsx.
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    ),
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
