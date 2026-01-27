import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'error'>('processing')

  useEffect(() => {
    // Supabase automatically handles the OAuth code exchange
    // We just need to listen for the auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
          // Successfully signed in (INITIAL_SESSION fires if tokens were
          // processed before this listener was set up during hydration)
          toast.success('Signed in successfully')
          navigate({ to: '/dashboard' })
        } else if (event === 'SIGNED_OUT') {
          // Explicit sign-out during callback — treat as failure
          setStatus('error')
          toast.error('Authentication failed')
          setTimeout(() => {
            navigate({ to: '/login' })
          }, 2000)
        }
        // INITIAL_SESSION with null session is ignored — tokens may still
        // be processing, wait for SIGNED_IN to follow
      }
    )

    // Check for immediate errors in the URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const error = hashParams.get('error')
    const errorDescription = hashParams.get('error_description')

    if (error) {
      setStatus('error')
      toast.error(errorDescription || 'Authentication failed')
      setTimeout(() => {
        navigate({ to: '/login' })
      }, 2000)
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        {status === 'processing' ? (
          <>
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900 mx-auto" />
            <p className="text-lg text-slate-600">Signing in...</p>
          </>
        ) : (
          <p className="text-lg text-red-600">Authentication failed. Redirecting...</p>
        )}
      </div>
    </div>
  )
}
