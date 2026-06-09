import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@/lib/i18n'
import { PinSidebar } from './pin-sidebar'
import { buildPin } from '@/test/factories'

// The sidebar pulls its pin/boards/article/connection through hooks and renders
// several child sections that each hit their own hooks. Stub the data hooks and
// the heavy child sections so the test exercises only the AI-disclosure switches.
const mutateAsync = vi.fn().mockResolvedValue({})
let currentPin = buildPin()

vi.mock('@/lib/hooks/use-pins', () => ({
  usePin: () => ({ data: currentPin, isLoading: false }),
  useUpdatePin: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/lib/hooks/use-articles', () => ({
  useArticle: () => ({ data: null }),
}))
vi.mock('@/lib/hooks/use-pinterest-connection', () => ({
  usePinterestConnection: () => ({
    data: { connected: true, connection: { is_active: true } },
  }),
  usePinterestBoards: () => ({ data: [] }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/pins/pin-media-preview', () => ({
  PinMediaPreview: () => null,
}))
vi.mock('@/components/pins/generate-metadata-button', () => ({
  GenerateMetadataButton: () => null,
}))
vi.mock('@/components/pins/metadata-history-dialog', () => ({
  MetadataHistoryDialog: () => null,
}))
vi.mock('@/components/pins/regenerate-feedback-dialog', () => ({
  RegenerateFeedbackDialog: () => null,
}))
vi.mock('@/components/pins/delete-pin-dialog', () => ({
  DeletePinDialog: () => null,
}))
vi.mock('@/components/pins/publish-pin-button', () => ({
  PublishPinButton: () => null,
}))
vi.mock('@/components/pins/schedule-pin-section', () => ({
  SchedulePinSection: () => null,
}))

afterEach(() => {
  cleanup()
  mutateAsync.mockClear()
})

function renderSidebar(pinOverrides = {}) {
  currentPin = buildPin(pinOverrides)
  render(<PinSidebar pinId={currentPin.id} onClose={() => {}} />)
  const aiModified = screen.getByRole('switch', { name: /created\/edited with ai/i })
  const synthetic = screen.getByRole('switch', { name: /ai-generated person/i })
  return { aiModified, synthetic }
}

describe('PinSidebar — AI disclosure switches', () => {
  it('renders both switches with defaults from the loaded pin', () => {
    const { aiModified, synthetic } = renderSidebar({
      ai_modified: true,
      synthetic_performer: false,
    })

    expect(aiModified.getAttribute('aria-checked')).toBe('true')
    expect(synthetic.getAttribute('aria-checked')).toBe('false')
    expect((aiModified as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the synthetic_performer hint text', () => {
    renderSidebar()
    expect(
      screen.getByText(/only if the image shows an ai-invented person/i),
    ).toBeTruthy()
  })

  it('locks ai_modified on while synthetic_performer is enabled', () => {
    const { aiModified, synthetic } = renderSidebar({
      ai_modified: true,
      synthetic_performer: false,
    })

    fireEvent.click(synthetic)
    expect(synthetic.getAttribute('aria-checked')).toBe('true')
    expect(aiModified.getAttribute('aria-checked')).toBe('true')
    expect((aiModified as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(synthetic)
    expect(synthetic.getAttribute('aria-checked')).toBe('false')
    expect((aiModified as HTMLButtonElement).disabled).toBe(false)
  })

  it('persists both booleans on submit', async () => {
    const { synthetic } = renderSidebar({
      ai_modified: true,
      synthetic_performer: false,
    })

    fireEvent.click(synthetic)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1)
    })
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      ai_modified: true,
      synthetic_performer: true,
    })
  })
})
