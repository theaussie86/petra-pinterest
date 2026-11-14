import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/lib/i18n'
import { AiMetadataSetting } from './ai-metadata-setting'

const { mockUseEnabled, mockMutate } = vi.hoisted(() => ({
  mockUseEnabled: vi.fn(),
  mockMutate: vi.fn(),
}))

vi.mock('@/lib/hooks/use-tenant-settings', () => ({
  useAiMetadataEnabled: () => mockUseEnabled(),
  useSetAiMetadataEnabled: () => ({ mutate: mockMutate, isPending: false }),
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderSetting() {
  return render(
    <I18nextProvider i18n={i18n}>
      <AiMetadataSetting />
    </I18nextProvider>,
  )
}

describe('AiMetadataSetting (ADR-0009)', () => {
  it('shows the switch with label and explanation, on by default', () => {
    mockUseEnabled.mockReturnValue({ enabled: true, isLoading: false })
    renderSetting()

    const toggle = screen.getByRole('switch', { name: 'KI-Metadaten automatisch erzeugen (Gemini)' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/keine Gemini-Kosten/)).toBeTruthy()
  })

  it('switches AI metadata off', () => {
    mockUseEnabled.mockReturnValue({ enabled: true, isLoading: false })
    renderSetting()

    fireEvent.click(screen.getByRole('switch'))
    expect(mockMutate).toHaveBeenCalledWith(false)
  })

  it('switches AI metadata back on', () => {
    mockUseEnabled.mockReturnValue({ enabled: false, isLoading: false })
    renderSetting()

    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('switch'))
    expect(mockMutate).toHaveBeenCalledWith(true)
  })

  it('disables the switch while loading', () => {
    mockUseEnabled.mockReturnValue({ enabled: true, isLoading: true })
    renderSetting()
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })
})
