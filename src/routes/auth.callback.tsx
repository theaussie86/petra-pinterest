import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { exchangeCodeFn } from '@/lib/server/auth'

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) || undefined,
    error: (search.error as string) || undefined,
    error_description: (search.error_description as string) || undefined,
  }),
  beforeLoad: async ({ search }) => {
    // Handle OAuth errors returned in the URL
    if (search.error) {
      throw redirect({ to: '/login' })
    }

    // Exchange the PKCE code for a session (sets cookies server-side)
    if (search.code) {
      const result = await exchangeCodeFn({ data: { code: search.code } })
      if (!result.error) {
        throw redirect({ to: '/dashboard' })
      }
    }

    // No code and no error — shouldn't happen, redirect to login
    throw redirect({ to: '/login' })
  },
  component: AuthCallbackFallback,
})

function AuthCallbackFallback() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900 mx-auto" />
        <p className="text-lg text-slate-600">{t('authCallback.loading')}</p>
      </div>
    </div>
  )
}
