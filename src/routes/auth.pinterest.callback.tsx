import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { exchangePinterestCallbackFn } from '@/lib/server/pinterest-oauth'

export const Route = createFileRoute('/auth/pinterest/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) || undefined,
    state: (search.state as string) || undefined,
    error: (search.error as string) || undefined,
  }),
  beforeLoad: async ({ search }) => {
    // Handle OAuth errors returned by Pinterest (user cancelled or Pinterest error)
    if (search.error) {
      // Try to look up blog_project_id from state if available (to redirect back to project)
      // If state is missing, redirect to dashboard
      throw redirect({
        to: '/dashboard',
        search: { pinterest_error: search.error },
      })
    }

    // Handle successful authorization
    if (search.code && search.state) {
      const result = await exchangePinterestCallbackFn({
        data: { code: search.code, state: search.state },
      })

      if (result.success && result.blog_project_id) {
        // Success: redirect to project page with success indicator
        throw redirect({
          to: '/projects/$projectId',
          params: { projectId: result.blog_project_id },
          search: { pinterest_connected: 'true', pinterest_error: undefined },
        })
      } else {
        // Exchange failed: redirect to dashboard with error
        throw redirect({
          to: '/dashboard',
          search: { pinterest_error: result.error || 'OAuth failed' },
        })
      }
    }

    // Neither code nor error present: shouldn't happen, redirect to dashboard
    throw redirect({ to: '/dashboard' })
  },
  component: PinterestCallbackFallback,
})

function PinterestCallbackFallback() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900 mx-auto" />
        <p className="text-lg text-slate-600">{t('pinterestCallback.loading')}</p>
      </div>
    </div>
  )
}
