import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  tenant_id: string
  display_name: string
}

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
 * Signs out the current user and clears session
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw error
  }
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

/**
 * Gets the current authenticated user (auth check only, no profile data)
 * Returns basic user info if authenticated, null if not
 * Use this for auth guards - it doesn't depend on profile table
 */
export async function getAuthUser(): Promise<{ id: string; email: string } | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

  return {
    id: user.id,
    email: user.email || '',
  }
}

/**
 * Gets the current authenticated user with profile data
 * Ensures profile exists (creates on-demand if missing)
 * Only returns null if user is not authenticated
 */
export async function getUser(): Promise<AuthUser | null> {
  // First check authentication
  const authUser = await getAuthUser()

  if (!authUser) {
    return null
  }

  // Ensure profile exists (creates on-demand if missing) and get data
  try {
    const { tenant_id } = await ensureProfile()
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', authUser.id)
      .single()

    return {
      id: authUser.id,
      email: authUser.email,
      tenant_id,
      display_name: profile?.display_name || authUser.email.split('@')[0] || 'User',
    }
  } catch {
    // If ensureProfile fails entirely, fall back to empty tenant_id
    return {
      id: authUser.id,
      email: authUser.email,
      tenant_id: '',
      display_name: authUser.email.split('@')[0] || 'User',
    }
  }
}

/**
 * Subscribe to auth state changes
 * Returns unsubscribe function
 */
export function onAuthStateChange(
  callback: (user: User | null) => void
): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      callback(session?.user ?? null)
    }
  )

  return () => {
    subscription.unsubscribe()
  }
}
