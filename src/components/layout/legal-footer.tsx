import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

const linkClassName = 'hover:text-slate-900 hover:underline underline-offset-4'

const legalLinks = [
  { to: '/impressum', labelKey: 'legal.impressum' },
  { to: '/datenschutz', labelKey: 'legal.datenschutz' },
  { to: '/agb', labelKey: 'legal.agb' },
] as const

/**
 * Public footer with links to the legal pages (Impressum, Datenschutz, AGB).
 * Shown on the login page and the MCP consent page so visitors can reach the
 * legally required pages without logging in.
 */
export function LegalFooter() {
  const { t } = useTranslation()

  return (
    <footer className="w-full border-t border-slate-200 py-6">
      <nav
        aria-label={t('legal.footerLabel')}
        className="mx-auto flex max-w-md items-center justify-center gap-4 text-sm text-slate-500"
      >
        {legalLinks.map(({ to, labelKey }) => (
          <Link key={to} to={to} className={linkClassName}>
            {t(labelKey)}
          </Link>
        ))}
      </nav>
    </footer>
  )
}
