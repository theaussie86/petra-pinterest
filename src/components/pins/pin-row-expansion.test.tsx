import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@/lib/i18n'
import { PinRowExpansion } from './pin-row-expansion'
import { buildPin } from '@/test/factories'

// The row expansion drives the pin update + AI metadata flows through hooks and
// renders the GenerateMetadataButton plus the history/regenerate dialogs. Stub the
// data/mutation hooks and the dialogs so the test exercises the metadata controls.
const updateMutate = vi.fn()
const generateMutate = vi.fn()
const publishMutate = vi.fn()

vi.mock('@/lib/hooks/use-pins', () => ({
  useUpdatePin: () => ({ mutate: updateMutate, isPending: false }),
}))
vi.mock('@/lib/hooks/use-metadata', () => ({
  useGenerateMetadata: () => ({ mutate: generateMutate, isPending: false }),
}))
// Account setting "KI-Metadaten automatisch erzeugen" (ADR-0009); on unless a test switches it off.
const aiMetadata = { enabled: true }
vi.mock('@/lib/hooks/use-tenant-settings', () => ({
  useAiMetadataEnabled: () => ({ enabled: aiMetadata.enabled, isLoading: false, isError: false }),
}))
vi.mock('@/lib/hooks/use-pinterest-publishing', () => ({
  usePublishPin: () => ({ mutate: publishMutate, isPending: false }),
}))
vi.mock('./metadata-history-dialog', () => ({
  MetadataHistoryDialog: () => null,
}))
vi.mock('./regenerate-feedback-dialog', () => ({
  RegenerateFeedbackDialog: () => null,
}))

afterEach(() => {
  cleanup()
  updateMutate.mockClear()
  generateMutate.mockClear()
  publishMutate.mockClear()
  aiMetadata.enabled = true
})

function renderRow(pinOverrides = {}) {
  const pin = buildPin(pinOverrides)
  render(<PinRowExpansion pin={pin} boards={[]} boardsLoading={false} />)
  return pin
}

describe('PinRowExpansion — AI metadata generation', () => {
  it('shows the Generate Metadata button when the pin has no metadata', () => {
    const pin = renderRow({ title: null, description: null })

    const button = screen.getByRole('button', { name: /generate metadata/i })
    fireEvent.click(button)

    expect(generateMutate).toHaveBeenCalledWith({ pin_id: pin.id })
  })

  it('shows regenerate + history controls when the pin already has metadata', () => {
    renderRow({ title: 'A title', description: 'A description' })

    expect(screen.getByRole('button', { name: /regenerate with feedback/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /view history/i })).toBeTruthy()
  })

  it('surfaces the error state with a retry control', () => {
    const pin = renderRow({
      status: 'error',
      previous_status: 'generating_metadata',
      error_message: 'Boom while generating',
    })

    expect(screen.getByText('Boom while generating')).toBeTruthy()

    const retry = screen.getByRole('button', { name: /retry generation/i })
    fireEvent.click(retry)

    expect(generateMutate).toHaveBeenCalledWith({ pin_id: pin.id })
  })
})

describe('PinRowExpansion — AI metadata switched off (ADR-0009)', () => {
  it('hides generate and regenerate actions and shows a hint', () => {
    aiMetadata.enabled = false
    renderRow({ title: null, description: null })

    expect(screen.queryByRole('button', { name: /generate metadata/i })).toBeNull()
    expect(screen.getByText(/AI metadata is switched off in the settings/i)).toBeTruthy()
  })

  it('keeps only the history for pins with metadata', () => {
    aiMetadata.enabled = false
    renderRow({ title: 'A title', description: 'A description' })

    expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull()
    expect(screen.getByRole('button', { name: /view history/i })).toBeTruthy()
  })

  it('offers a reset instead of a generation retry in the error alert', () => {
    aiMetadata.enabled = false
    const pin = renderRow({
      status: 'error',
      previous_status: 'generating_metadata',
      error_message: 'Boom while generating',
    })

    expect(screen.queryByRole('button', { name: /retry generation/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))

    expect(generateMutate).not.toHaveBeenCalled()
    expect(updateMutate).toHaveBeenCalledWith({ id: pin.id, status: 'draft', error_message: null })
  })
})
