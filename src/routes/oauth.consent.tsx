import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LegalFooter } from '@/components/layout/legal-footer'
import { supabase } from '@/lib/supabase'
import { describeRedirectHost } from '@/lib/oauth-consent'

/**
 * `/oauth/consent` — the MCP OAuth consent page (Spec #115, ADR-0006).
 *
 * Supabase Auth (the OAuth 2.1 server) redirects the user here with an
 * `authorization_id` after a client starts the flow. Without a session the user
 * is sent through Google login first and returned via `next`. If consent was
 * already granted the Supabase API returns a redirect straight away; otherwise
 * the user sees which client wants access and where it redirects, with a warning
 * for unknown hosts, and approves or denies through the Supabase OAuth API.
 */
export const Route = createFileRoute('/oauth/consent')({
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id:
      typeof search.authorization_id === 'string'
        ? search.authorization_id
        : undefined,
  }),
  component: ConsentPage,
})

type Details = {
  authorizationId: string
  clientName: string
  redirectUri: string
  scope: string
}

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'consent'; details: Details }

function ConsentPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { authorization_id: authorizationId } = Route.useSearch()
  const [view, setView] = useState<ViewState>({ status: 'loading' })
  const [submitting, setSubmitting] = useState(false)
  // StrictMode mounts effects twice in dev; guard the one-shot bootstrap.
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    async function bootstrap() {
      if (!authorizationId) {
        setView({ status: 'error', message: t('consent.missingRequest') })
        return
      }

      // Require a session; send unauthenticated users through Google login and
      // back to this exact consent URL.
      const { data: claims } = await supabase.auth.getClaims()
      if (!claims?.claims) {
        const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
        navigate({ to: '/login', search: { next } })
        return
      }

      const { data, error } =
        await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (error || !data) {
        setView({ status: 'error', message: t('consent.error') })
        return
      }

      // Already consented → Supabase returns a ready-to-use redirect URL.
      if ('redirect_url' in data) {
        window.location.href = data.redirect_url
        return
      }

      setView({
        status: 'consent',
        details: {
          authorizationId: data.authorization_id,
          clientName: data.client.name,
          redirectUri: data.redirect_uri,
          scope: data.scope,
        },
      })
    }

    bootstrap().catch(() => {
      setView({ status: 'error', message: t('consent.error') })
    })
  }, [authorizationId, navigate, t])

  async function decide(approve: boolean) {
    if (view.status !== 'consent' || submitting) return
    setSubmitting(true)

    const api = supabase.auth.oauth
    const { data, error } = approve
      ? await api.approveAuthorization(view.details.authorizationId, {
          skipBrowserRedirect: true,
        })
      : await api.denyAuthorization(view.details.authorizationId, {
          skipBrowserRedirect: true,
        })

    if (error || !data) {
      setSubmitting(false)
      setView({ status: 'error', message: t('consent.error') })
      return
    }

    window.location.href = data.redirect_url
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 px-4">
      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          {view.status === 'loading' && (
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
              <p className="text-lg text-slate-600">{t('consent.loading')}</p>
            </div>
          )}

          {view.status === 'error' && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
              <p className="text-slate-700">{view.message}</p>
            </div>
          )}

          {view.status === 'consent' && (
            <ConsentCard
              details={view.details}
              submitting={submitting}
              onApprove={() => decide(true)}
              onDeny={() => decide(false)}
            />
          )}
        </div>
      </div>

      <LegalFooter />
    </div>
  )
}

function ConsentCard({
  details,
  submitting,
  onApprove,
  onDeny,
}: {
  details: Details
  submitting: boolean
  onApprove: () => void
  onDeny: () => void
}) {
  const { t } = useTranslation()
  const host = describeRedirectHost(details.redirectUri)

  return (
    <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t('consent.title')}
        </h1>
        <p className="text-slate-600">
          {t('consent.description', { client: details.clientName })}
        </p>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-slate-500">{t('consent.redirectLabel')}</dt>
          <dd className="font-mono font-medium text-slate-900">{host.host}</dd>
        </div>
        {details.scope && (
          <div className="flex items-start justify-between gap-4">
            <dt className="text-slate-500">{t('consent.scopeLabel')}</dt>
            <dd className="text-right font-medium text-slate-900">
              {details.scope}
            </dd>
          </div>
        )}
      </dl>

      {!host.known && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{t('consent.unknownHostWarning')}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onDeny}
          disabled={submitting}
        >
          {t('consent.deny')}
        </Button>
        <Button className="flex-1" onClick={onApprove} disabled={submitting}>
          {submitting ? t('consent.redirecting') : t('consent.approve')}
        </Button>
      </div>
    </div>
  )
}
