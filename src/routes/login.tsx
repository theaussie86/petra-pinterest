import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/lib/auth'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true)
      await signInWithGoogle()
      // OAuth redirect happens automatically
    } catch (error) {
      setIsLoading(false)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to sign in with Google'
      )
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">
            Petra
          </h1>
          <p className="text-lg text-slate-600">
            Schedule Pinterest pins for multiple blogs from a single calendar view
          </p>
        </div>

        <div className="pt-4">
          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            size="lg"
            className="w-full max-w-xs"
          >
            {isLoading ? 'Redirecting...' : 'Sign in with Google'}
          </Button>
        </div>
      </div>
    </div>
  )
}
