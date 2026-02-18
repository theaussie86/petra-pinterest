import { renderHook } from '@testing-library/react'
import { useDateLocale } from './date-locale'

const mockLanguage = { current: 'de' }

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: mockLanguage.current },
    t: (key: string) => key,
  }),
}))

describe('useDateLocale', () => {
  it('returns German locale for "de"', () => {
    mockLanguage.current = 'de'
    const { result } = renderHook(() => useDateLocale())
    expect(result.current.code).toBe('de')
  })

  it('returns English locale for "en"', () => {
    mockLanguage.current = 'en'
    const { result } = renderHook(() => useDateLocale())
    expect(result.current.code).toBe('en-US')
  })

  it('falls back to German locale for unknown language', () => {
    mockLanguage.current = 'fr'
    const { result } = renderHook(() => useDateLocale())
    expect(result.current.code).toBe('de')
  })
})
