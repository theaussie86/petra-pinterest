const { mockInit, mockUse } = vi.hoisted(() => ({
  mockInit: vi.fn().mockReturnValue(Promise.resolve()),
  mockUse: vi.fn().mockReturnThis(),
}))

vi.mock('i18next', () => ({
  default: {
    use: (...args: any[]) => {
      mockUse(...args)
      return { use: mockUse, init: mockInit }
    },
    init: mockInit,
  },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('i18next-browser-languagedetector', () => ({
  default: { type: 'languageDetector', init: vi.fn() },
}))

vi.mock('@/locales/de.json', () => ({ default: { hello: 'Hallo' } }))
vi.mock('@/locales/en.json', () => ({ default: { hello: 'Hello' } }))

describe('i18n configuration', () => {
  it('initializes i18next with correct config and both locales', async () => {
    await import('./i18n')

    expect(mockUse).toHaveBeenCalledTimes(2)
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackLng: 'de',
        supportedLngs: ['de', 'en'],
        interpolation: { escapeValue: false },
        detection: expect.objectContaining({
          order: ['cookie', 'navigator'],
          caches: ['cookie'],
        }),
      }),
    )

    const config = mockInit.mock.calls[0][0]
    expect(config.resources.de).toBeDefined()
    expect(config.resources.en).toBeDefined()
  })
})
