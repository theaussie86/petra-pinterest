---
status: accepted
---

# Isomorphic Supabase client for SSR-authenticated prefetched reads

Route loaders prefetch query data on the server via `ensureQueryData`, but the read path used the browser Supabase singleton (`createBrowserClient`), which has no session during SSR. Every RLS-gated read returned empty server-side, the empty result was dehydrated to the client, and `useSuspenseQuery` held it within its `staleTime` — so a logged-in user saw empty data on first paint across the app. We fix this with an **isomorphic Supabase selector** (`getSupabaseClient`, built with TanStack Start's `createIsomorphicFn`): in the browser it returns the existing `createBrowserClient` singleton, during SSR it returns a fresh `getSupabaseServerClient()` (cookie-bound, RLS-enforced). Read functions call `getSupabaseClient()` instead of importing `supabase` directly. **Mutations stay on the browser client unchanged** — they only ever run client-side and need `supabase.auth.getUser()`.

## Considered options

- **Wrap each read in `createServerFn` (rejected).** Consistent with `fetchUser`, framework-blessed boundary, zero bundle-leak risk. But it routes *every* client-side read through our own Node server (client → server fn → Supabase → back), adding a hop and doubling infra load on every navigation and realtime-invalidation refetch — for no benefit on a low-traffic self-hosted dashboard. The isomorphic selector keeps the browser read path direct to Supabase and only swaps the client under SSR.
- **Naive `typeof window` branch (rejected).** Would leave the server-only `@tanstack/react-start/server` import (`getCookies`/`setCookie`) reachable in the client bundle. `createIsomorphicFn` is compile-time: the `.server()` branch is stripped from the client build, so the server import tree-shakes out — provided the selector lives in its own side-effect-free module (`src/lib/supabase-iso.ts`), not inline in a read file.

## Consequences

- **Per-request session is guaranteed.** `createIsomorphicFn` replaces the call with the inner branch fn, so each `getSupabaseClient()` invocation calls `getSupabaseServerClient()` fresh — binding to the current request's cookies. Combined with the per-request `QueryClient`, tenants stay isolated under SSR (no cross-user cache bleed).
- **This is the pattern every later SSR read slice copies** (#46). Swap the read's `supabase` import for `getSupabaseClient`; leave mutations alone.
- **Tests mock `@/lib/supabase-iso`** (`getSupabaseClient`) instead of `@/lib/supabase` for the read functions; mutation tests still mock `@/lib/supabase`.
- Applied in this slice to all reads in `src/lib/api/blog-projects.ts` (`getBlogProjects`, `getBlogProject`, `checkProjectRelatedData`); the projects list is the verified tracer.
