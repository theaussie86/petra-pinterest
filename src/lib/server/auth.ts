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
 */
export const fetchUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    // Ensure profile exists (creates on-demand if missing)
    let tenant_id = ''
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'ensure_profile_exists',
      )
      if (!rpcError && rpcData && rpcData.length > 0) {
        tenant_id = rpcData[0].tenant_id
      }
    } catch {
      // Profile creation failed — continue with empty tenant_id
    }

    // Fetch display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    return {
      id: user.id,
      email: user.email || '',
      tenant_id,
      display_name:
        profile?.display_name || user.email?.split('@')[0] || 'User',
    } satisfies AuthUser
  },
)

/**
 * Server function: exchange an OAuth PKCE code for a session.
 * Sets the session cookies so subsequent requests are authenticated.
 */
export const exchangeCodeFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data: { code } }) => {
    const supabase = getSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return { error: error.message }
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
