import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import i18n from '@/lib/i18n'
import { WorkshopTemplateTabs } from './workshop-template-tabs'

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(cleanup)

describe('WorkshopTemplateTabs', () => {
  const counts = { open: 3, approved: 2, archived: 1 }

  it('renders the three workspace tabs with their counts', () => {
    render(<WorkshopTemplateTabs activeTab="open" counts={counts} onTabChange={vi.fn()} />)

    // Labels
    expect(screen.getByText('Offen')).toBeTruthy()
    expect(screen.getByText('Freigegeben')).toBeTruthy()
    expect(screen.getByText('Archiv')).toBeTruthy()
    // Counts
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('calls onTabChange with the clicked tab', () => {
    const onTabChange = vi.fn()
    render(<WorkshopTemplateTabs activeTab="open" counts={counts} onTabChange={onTabChange} />)

    fireEvent.mouseDown(screen.getByText('Freigegeben'))
    expect(onTabChange).toHaveBeenCalledWith('approved')
  })
})
