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
 * Gets the current authenticated user with profile data
 * Returns null if not authenticated or profile doesn't exist
 */
export async function getUser(): Promise<AuthUser | null> {
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

  // Get profile data with tenant_id and display_name
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('tenant_id, display_name')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return null
  }

  return {
    id: user.id,
    email: user.email || '',
    tenant_id: profile.tenant_id,
    display_name: profile.display_name,
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
