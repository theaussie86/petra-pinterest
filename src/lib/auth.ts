import { supabase } from '@/lib/supabase'
import { signOutFn } from '@/lib/server/auth'

export type { AuthUser } from '@/lib/server/auth'

/**
 * Initiates Google OAuth sign-in flow
 * Redirects to Google, then back to /auth/callback
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) {
    throw error
  }

  return data
}

/**
 * Signs out the current user and clears session cookies
 */
export async function signOut() {
  await signOutFn()
}

/**
 * Ensures a profile exists for the current user, creating one if missing
 * Uses SECURITY DEFINER RPC to bypass RLS for profile creation
 * Returns the user's tenant_id
 */
export async function ensureProfile(): Promise<{ tenant_id: string }> {
  const { data, error } = await supabase.rpc('ensure_profile_exists')
  if (error) throw new Error(`Unable to resolve user profile: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Unable to resolve user profile')
  return { tenant_id: data[0].tenant_id }
}
