import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/lib/i18n'
import { ConnectAgentGuide } from './connect-agent-guide'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderGuide() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ConnectAgentGuide />
    </I18nextProvider>,
  )
}

const MCP_URL = `${window.location.origin}/mcp`

describe('ConnectAgentGuide', () => {
  it('shows the MCP URL of the current origin', () => {
    renderGuide()
    expect(screen.getByText(MCP_URL)).toBeTruthy()
  })

  it('shows the Claude steps by default', () => {
    renderGuide()
    expect(
      screen.getByText(i18n.t('settings.connectGuide.clients.claude.step2')),
    ).toBeTruthy()
  })

  it('copies the MCP URL to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderGuide()
    fireEvent.click(
      screen.getAllByRole('button', { name: i18n.t('settings.connectGuide.copy') })[0],
    )
    expect(writeText).toHaveBeenCalledWith(MCP_URL)
  })
})
