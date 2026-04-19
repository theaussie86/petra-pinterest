import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeader } from '@tanstack/react-start/server'

export const detectLanguageFn = createServerFn({ method: 'GET' }).handler(async () => {
  const cookieLang = getCookie('i18next')
  if (cookieLang === 'de' || cookieLang === 'en') return cookieLang

  const acceptLang = getRequestHeader('accept-language') ?? ''
  if (/^de\b/.test(acceptLang)) return 'de'
  if (/^en\b/.test(acceptLang)) return 'en'
  return 'de'
})
