import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import i18n from '@/lib/i18n'
import { WorkshopTemplateDetail, overlayFooterDomain } from './workshop-template-detail'
import { buildPinTemplate } from '@/test/factories'

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
})
