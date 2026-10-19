import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/lib/i18n'
import { LegalFooter } from './legal-footer'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

// Render the router Link as a plain anchor carrying its target so we can assert
// the footer links point at the public legal routes without a real router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
  }: {
    children: React.ReactNode
    to: string
  }) => <a data-to={to}>{children}</a>,
}))

afterEach(cleanup)

function renderFooter() {
  return render(
    <I18nextProvider i18n={i18n}>
      <LegalFooter />
    </I18nextProvider>,
  )
}

describe('LegalFooter', () => {
  it('links to the three public legal routes', () => {
    renderFooter()

    expect(screen.getByText('Impressum').closest('a')?.getAttribute('data-to')).toBe(
      '/impressum',
    )
    expect(
      screen.getByText('Datenschutz').closest('a')?.getAttribute('data-to'),
    ).toBe('/datenschutz')
    expect(screen.getByText('AGB').closest('a')?.getAttribute('data-to')).toBe('/agb')
  })

  it('renders as a footer landmark', () => {
    renderFooter()
    expect(screen.getByRole('contentinfo')).toBeTruthy()
  })
})
