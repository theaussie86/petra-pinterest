import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { de } from 'date-fns/locale/de'
import { enUS } from 'date-fns/locale/en-US'
import type { Locale } from 'date-fns'

const localeMap: Record<string, Locale> = {
  de,
  en: enUS,
}

export function useDateLocale(): Locale {
  const { i18n } = useTranslation()
  return useMemo(() => localeMap[i18n.language] ?? de, [i18n.language])
}
