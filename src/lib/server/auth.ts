import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from './supabase'

export interface AuthUser {
  id: string
  email: string
  tenant_id: string
  display_name: string
}

/**
 * Server function: get the current authenticated user with profile data.
 * Reads session from cookies so it works during SSR and client navigation.
 *
 * Verifies the JWT via `getClaims()` — local verification when the project's
 * asymmetric signing keys are enabled, falling back to a network call to the
 * Auth server otherwise. Profile creation is NOT done here; it runs once at
 * login (see `exchangeCodeFn`). This keeps the navigation hot path to a single
 * verify + one `profiles` read.
 */
export const fetchUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.auth.getClaims()

    if (error || !data?.claims) {
      return null
    }

    const { claims } = data
    const id = claims.sub
    const email = typeof claims.email === 'string' ? claims.email : ''

    // Single profiles read for tenant_id + display_name.
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, display_name')
      .eq('id', id)
      .single()

    return {
      id,
      email,
      tenant_id: profile?.tenant_id || '',
      display_name: profile?.display_name || email.split('@')[0] || 'User',
    } satisfies AuthUser
  },
)

/**
 * Server function: exchange an OAuth PKCE code for a session.
 * Sets the session cookies so subsequent requests are authenticated.
 *
 * Profile bootstrap lives here so `ensure_profile_exists` runs exactly once
 * per login — not on every navigation. A new user signing in for the first
 * time gets a profile + tenant; returning users are a no-op. Failure to
 * provision is non-fatal: the session is still valid and `fetchUser` falls
 * back to an empty tenant_id until the profile resolves.
 */
export const exchangeCodeFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data: { code } }) => {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return { error: error.message }
    }

    try {
      await supabase.rpc('ensure_profile_exists')
    } catch {
      // Non-fatal — session is established; profile can be retried later.
    }

    return { error: null }
  })

/**
 * Server function: sign out the current user and clear session cookies.
 */
export const signOutFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      return { error: error.message }
    }
    return { error: null }
  },
)
