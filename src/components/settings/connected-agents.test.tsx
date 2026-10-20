import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/lib/i18n'
import { ConnectedAgents } from './connected-agents'
import type { ConnectedAgent } from '@/lib/api/connected-agents'

const { mockUseConnectedAgents, mockRevoke } = vi.hoisted(() => ({
  mockUseConnectedAgents: vi.fn(),
  mockRevoke: vi.fn(),
}))

vi.mock('@/lib/hooks/use-connected-agents', () => ({
  useConnectedAgents: () => mockUseConnectedAgents(),
  useRevokeConnectedAgent: () => ({ mutate: mockRevoke, isPending: false }),
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderAgents() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ConnectedAgents />
    </I18nextProvider>,
  )
}

const CLAUDE: ConnectedAgent = {
  clientId: 'c1',
  name: 'Claude',
  grantedAt: '2026-10-10T08:00:00Z',
  scopes: ['openid', 'profile'],
}

describe('ConnectedAgents', () => {
  it('shows a loading state while fetching', () => {
    mockUseConnectedAgents.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderAgents()
    expect(screen.getByText(i18n.t('settings.connectedAgents.loading'))).toBeTruthy()
  })

  it('shows an error state when the query fails', () => {
    mockUseConnectedAgents.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderAgents()
    expect(screen.getByText(i18n.t('settings.connectedAgents.error'))).toBeTruthy()
  })

  it('shows the empty state when no agent is connected', () => {
    mockUseConnectedAgents.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderAgents()
    expect(screen.getByText(i18n.t('settings.connectedAgents.empty'))).toBeTruthy()
  })

  it('lists each connected agent with its name', () => {
    mockUseConnectedAgents.mockReturnValue({ data: [CLAUDE], isLoading: false, isError: false })
    renderAgents()
    expect(screen.getByText('Claude')).toBeTruthy()
  })

  it('revokes only after the confirmation is accepted', () => {
    mockUseConnectedAgents.mockReturnValue({ data: [CLAUDE], isLoading: false, isError: false })
    renderAgents()

    // Opening the row's revoke control alone must not revoke.
    fireEvent.click(screen.getByRole('button', { name: i18n.t('settings.connectedAgents.revoke') }))
    expect(mockRevoke).not.toHaveBeenCalled()

    // Confirm in the dialog.
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('settings.connectedAgents.confirmRevoke') }),
    )
    expect(mockRevoke).toHaveBeenCalledTimes(1)
    expect(mockRevoke.mock.calls[0][0]).toBe('c1')
  })
})
