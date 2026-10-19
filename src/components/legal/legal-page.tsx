import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LegalFooter } from '@/components/layout/legal-footer'

/**
 * Shared layout for the public legal pages. Renders a back-link to the login
 * page, the page title, the "still a draft" notice and the legal footer so a
 * visitor can move between Impressum, Datenschutz and AGB without logging in.
 */
export function LegalPage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <Link
          to="/login"
          className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-900"
        >
          {t('legal.backToLogin')}
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>

        <p
          role="note"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {t('legal.draftNotice')}
        </p>

        <div className="mt-8">{children}</div>
      </main>

      <LegalFooter />
    </div>
  )
}
