import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@/lib/i18n'
import { EditPinDialog } from './edit-pin-dialog'
import { buildPin } from '@/test/factories'

// The dialog pulls data/mutations through hooks; stub them so the test
// exercises only the AI-disclosure switch behaviour.
const mutateAsync = vi.fn().mockResolvedValue({})
vi.mock('@/lib/hooks/use-pins', () => ({
  useUpdatePin: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/lib/hooks/use-pinterest-connection', () => ({
  usePinterestConnection: () => ({
    data: { connected: true, connection: { is_active: true } },
  }),
  usePinterestBoards: () => ({ data: [] }),
}))

afterEach(cleanup)

function renderDialog(pinOverrides = {}) {
  const pin = buildPin(pinOverrides)
  render(
    <EditPinDialog
      open
      onOpenChange={() => {}}
      pin={pin}
      projectId="project-1"
    />,
  )
  const aiModified = screen.getByRole('switch', { name: /created\/edited with ai/i })
  const synthetic = screen.getByRole('switch', { name: /ai-generated person/i })
  return { aiModified, synthetic }
}

describe('EditPinDialog — AI disclosure switches', () => {
  it('renders both switches with defaults (ai_modified on, synthetic off)', () => {
    const { aiModified, synthetic } = renderDialog({
      ai_modified: true,
      synthetic_performer: false,
    })

    expect(aiModified.getAttribute('aria-checked')).toBe('true')
    expect(synthetic.getAttribute('aria-checked')).toBe('false')
    expect((aiModified as HTMLButtonElement).disabled).toBe(false)
  })

  it('locks ai_modified on while synthetic_performer is enabled', () => {
    const { aiModified, synthetic } = renderDialog({
      ai_modified: true,
      synthetic_performer: false,
    })

    // Turning synthetic on forces ai_modified on and disables it.
    fireEvent.click(synthetic)
    expect(synthetic.getAttribute('aria-checked')).toBe('true')
    expect(aiModified.getAttribute('aria-checked')).toBe('true')
    expect((aiModified as HTMLButtonElement).disabled).toBe(true)

    // Turning synthetic back off releases the lock.
    fireEvent.click(synthetic)
    expect(synthetic.getAttribute('aria-checked')).toBe('false')
    expect((aiModified as HTMLButtonElement).disabled).toBe(false)
  })

  it('forces ai_modified on even when starting from a synthetic pin', () => {
    const { aiModified, synthetic } = renderDialog({
      ai_modified: true,
      synthetic_performer: true,
    })

    expect(synthetic.getAttribute('aria-checked')).toBe('true')
    expect(aiModified.getAttribute('aria-checked')).toBe('true')
    expect((aiModified as HTMLButtonElement).disabled).toBe(true)
  })
})
