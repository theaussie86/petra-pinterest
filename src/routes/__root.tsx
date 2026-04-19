import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Link,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { I18nextProvider, useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import { fetchUser } from '@/lib/server/auth'
import { detectLanguageFn } from '@/lib/server/detect-language'
import '@/styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
    },
  },
})

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'theme-color', content: '#000000' },
      { name: 'description', content: 'Pinfinity — Automatisiere deine Pinterest Pins' },
      { title: 'Pinfinity' },
    ],
    links: [{ rel: 'icon', href: '/favicon.ico' }],
  }),
  beforeLoad: async () => {
    const user = await fetchUser()

    // Server-side only: detect language from cookie or Accept-Language header
    // to avoid hydration mismatch with client-side LanguageDetector.
    // The typeof check prevents detectLanguageFn from making an HTTP round-trip
    // on every client-side navigation.
    if (typeof window === 'undefined') {
      const lang = await detectLanguageFn()
      if (i18n.language !== lang) {
        await i18n.changeLanguage(lang)
      }
    }

    return { user }
  },
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
      <Toaster richColors position="bottom-left" />
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[
          {
            name: 'Tanstack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </RootDocument>
  )
}

function NotFound() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.message')}</p>
      <Link to="/login" className="text-primary underline underline-offset-4">
        {t('common.goHome')}
      </Link>
    </div>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <I18nextProvider i18n={i18n}>
      <html lang={i18n.language}>
        <head>
          <HeadContent />
        </head>
        <body>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
          <Scripts />
        </body>
      </html>
    </I18nextProvider>
  )
}
