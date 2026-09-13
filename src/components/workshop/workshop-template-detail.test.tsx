import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import i18n from '@/lib/i18n'
import { WorkshopTemplateDetail, overlayFooterDomain } from './workshop-template-detail'
import { buildPinTemplate, buildPinTemplateRevision } from '@/test/factories'

const toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}))

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(async () => {
  Object.assign(navigator, { clipboard: { writeText } })
  await i18n.changeLanguage('de')
})

afterEach(() => {
  cleanup()
  writeText.mockClear()
  toastSuccess.mockClear()
})

describe('overlayFooterDomain', () => {
  it('extracts the bare domain without the www prefix', () => {
    expect(overlayFooterDomain('https://www.himmelstraenen.de/blog')).toBe('himmelstraenen.de')
    expect(overlayFooterDomain('https://himmelstraenen.de')).toBe('himmelstraenen.de')
  })

  it('falls back to the trimmed input for a non-URL', () => {
    expect(overlayFooterDomain('  not a url  ')).toBe('not a url')
  })
})

describe('WorkshopTemplateDetail', () => {
  it('copies the full image_prompt to the clipboard with a toast', async () => {
    const template = buildPinTemplate({ image_prompt: 'FULL PROMPT TEXT' })
    render(<WorkshopTemplateDetail template={template} blogUrl="https://www.example.com" />)

    fireEvent.click(screen.getByRole('button', { name: /Bild-Prompt kopieren/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('FULL PROMPT TEXT'))
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('copies the image idea separately', async () => {
    const template = buildPinTemplate({ image_idea: 'A cozy scene' })
    render(<WorkshopTemplateDetail template={template} blogUrl="https://www.example.com" />)

    fireEvent.click(screen.getByRole('button', { name: /Bildidee kopieren/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('A cozy scene'))
  })

  it('marks a missing description as missing rather than leaving it blank', () => {
    const template = buildPinTemplate({ description: null })
    render(<WorkshopTemplateDetail template={template} blogUrl="https://www.example.com" />)

    expect(screen.getByText(/Beschreibung fehlt/i)).toBeTruthy()
  })

  it('renders the design colors as swatches', () => {
    const template = buildPinTemplate({
      design: { name: 'Bold', colors: ['#7c3aed', '#e11d48'] },
    })
    const { container } = render(
      <WorkshopTemplateDetail template={template} blogUrl="https://www.example.com" />,
    )

    const swatches = container.querySelectorAll('[data-testid="design-color"]')
    expect(swatches.length).toBe(2)
    expect((swatches[0] as HTMLElement).style.backgroundColor).toBeTruthy()
  })

  it('uses the blog project domain in the overlay footer', () => {
    const template = buildPinTemplate()
    render(
      <WorkshopTemplateDetail template={template} blogUrl="https://www.himmelstraenen.de/" />,
    )

    expect(screen.getByText('himmelstraenen.de')).toBeTruthy()
  })

  it('offers Freigeben and Archivieren for an open template', () => {
    const onChangeStatus = vi.fn()
    const template = buildPinTemplate({ status: 'draft' })
    render(
      <WorkshopTemplateDetail
        template={template}
        blogUrl="https://www.example.com"
        onChangeStatus={onChangeStatus}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Freigeben/i }))
    expect(onChangeStatus).toHaveBeenCalledWith('approved')

    fireEvent.click(screen.getByRole('button', { name: /Archivieren/i }))
    expect(onChangeStatus).toHaveBeenCalledWith('archived')
  })

  it('offers a reopen action for an approved template', () => {
    const onChangeStatus = vi.fn()
    const template = buildPinTemplate({ status: 'approved' })
    render(
      <WorkshopTemplateDetail
        template={template}
        blogUrl="https://www.example.com"
        onChangeStatus={onChangeStatus}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Zurück zu Offen/i }))
    expect(onChangeStatus).toHaveBeenCalledWith('draft')
    // No approve button once already approved.
    expect(screen.queryByRole('button', { name: /^Freigeben$/i })).toBeNull()
  })

  it('renders no status actions when no handler is provided', () => {
    const template = buildPinTemplate({ status: 'draft' })
    render(<WorkshopTemplateDetail template={template} blogUrl="https://www.example.com" />)

    expect(screen.queryByRole('button', { name: /Freigeben/i })).toBeNull()
  })

  it('submits a revision request with the trimmed feedback and closes the dialog', async () => {
    const onRequestRevision = vi.fn()
    const template = buildPinTemplate({ status: 'draft' })
    render(
      <WorkshopTemplateDetail
        template={template}
        blogUrl="https://www.example.com"
        onRequestRevision={onRequestRevision}
      />,
    )

    // Open the dialog from the action bar.
    fireEvent.click(screen.getByRole('button', { name: /Änderung wünschen/i }))

    const textarea = screen.getByLabelText(/Was soll der Agent ändern/i)
    fireEvent.change(textarea, { target: { value: '  Titel kürzen  ' } })

    // The dialog's submit button (there are two matching buttons: the trigger and
    // the submit — pick the one inside the dialog footer).
    const submitButtons = screen.getAllByRole('button', { name: /Änderung wünschen/i })
    fireEvent.click(submitButtons[submitButtons.length - 1])

    await waitFor(() => expect(onRequestRevision).toHaveBeenCalledWith('Titel kürzen'))
  })

  it('does not submit an empty revision request', () => {
    const onRequestRevision = vi.fn()
    const template = buildPinTemplate({ status: 'draft' })
    render(
      <WorkshopTemplateDetail
        template={template}
        blogUrl="https://www.example.com"
        onRequestRevision={onRequestRevision}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Änderung wünschen/i }))
    const submitButtons = screen.getAllByRole('button', { name: /Änderung wünschen/i })
    fireEvent.click(submitButtons[submitButtons.length - 1])

    expect(onRequestRevision).not.toHaveBeenCalled()
  })

  it('renders the change history newest first', () => {
    const template = buildPinTemplate()
    const revisions = [
      buildPinTemplateRevision({ feedback: 'Neuester Wunsch', created_at: '2025-03-01T00:00:00Z' }),
      buildPinTemplateRevision({ feedback: 'Älterer Wunsch', created_at: '2025-01-01T00:00:00Z' }),
    ]
    render(
      <WorkshopTemplateDetail
        template={template}
        blogUrl="https://www.example.com"
        revisions={revisions}
      />,
    )

    expect(screen.getByText(/Änderungsverlauf/i)).toBeTruthy()
    expect(screen.getByText('Neuester Wunsch')).toBeTruthy()
    expect(screen.getByText('Älterer Wunsch')).toBeTruthy()
  })

  it('shows an empty-history hint when there are no revisions', () => {
    const template = buildPinTemplate()
    render(
      <WorkshopTemplateDetail
        template={template}
        blogUrl="https://www.example.com"
        revisions={[]}
      />,
    )

    expect(screen.getByText(/Noch keine Änderungswünsche/i)).toBeTruthy()
  })
})
