import { createIsomorphicFn } from '@tanstack/react-start'
import { supabase } from '@/lib/supabase'
import { getSupabaseServerClient } from '@/lib/server/supabase'

/**
 * Isomorphic Supabase client selector for RLS-gated reads (see ADR 0003).
 *
 * - Browser: the `createBrowserClient` singleton — reads stay direct to
 *   Supabase, realtime/optimistic paths unchanged.
 * - SSR: a fresh cookie-bound `getSupabaseServerClient()` per call, so a
 *   loader-prefetched read carries the caller's session and RLS returns
 *   tenant-scoped rows instead of empty.
 *
 * `createIsomorphicFn` is compile-time: the `.server()` branch is stripped from
 * the client build, so the server-only `@tanstack/react-start/server` import
 * tree-shakes out. This MUST live in its own side-effect-free module (not inline
 * in a read file) for that to hold.
 *
 * Reads call `getSupabaseClient()`. Mutations stay on the browser `supabase`
 * client directly — they only ever run client-side.
 */
export const getSupabaseClient = createIsomorphicFn()
  .client(() => supabase)
  .server(() => getSupabaseServerClient())
