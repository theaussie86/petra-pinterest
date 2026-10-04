import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import i18n from '@/lib/i18n'
import { WorkshopArticleCuration, articleExcerpt } from './workshop-article-curation'
import { buildArticle } from '@/test/factories'

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(cleanup)

describe('articleExcerpt', () => {
  it('strips markdown, collapses whitespace and cuts at a word', () => {
    expect(articleExcerpt('# Titel\n\n**fett**  und   mehr')).toBe('Titel fett und mehr')
    expect(articleExcerpt('eins zwei drei', 9)).toBe('eins …')
    expect(articleExcerpt(null)).toBe('')
  })
})

describe('WorkshopArticleCuration', () => {
  it('requests pins with the typed note for an undecided article', () => {
    const onCurate = vi.fn()
    render(<WorkshopArticleCuration article={buildArticle()} onCurate={onCurate} />)

    fireEvent.change(screen.getByLabelText(/Hinweis für den Agenten/i), {
      target: { value: 'Fokus Weihnachten' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Pins erstellen lassen/i }))

    expect(onCurate).toHaveBeenCalledWith('wanted', 'Fokus Weihnachten')
  })

  it('excludes an undecided article', () => {
    const onCurate = vi.fn()
    render(<WorkshopArticleCuration article={buildArticle()} onCurate={onCurate} />)

    fireEvent.click(screen.getByRole('button', { name: /Keine Pins/i }))
    expect(onCurate).toHaveBeenCalledWith('excluded')
  })

  it('lets a wanted article withdraw its request', () => {
    const onCurate = vi.fn()
    render(
      <WorkshopArticleCuration
        article={buildArticle({ workshop_status: 'wanted', workshop_note: 'Alt' })}
        onCurate={onCurate}
      />,
    )

    expect(screen.getByText(/Wartet auf den Agenten/i)).toBeTruthy()
    // Saving is only possible once the note changed.
    expect((screen.getByRole('button', { name: /Hinweis speichern/i }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /Anfrage zurückziehen/i }))
    expect(onCurate).toHaveBeenCalledWith(null)
  })
})
