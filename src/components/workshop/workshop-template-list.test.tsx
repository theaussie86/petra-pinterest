import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@/lib/i18n'
import { WorkshopTemplateList } from './workshop-template-list'
import { buildPinTemplate } from '@/test/factories'

afterEach(cleanup)

describe('WorkshopTemplateList', () => {
  it('calls onSelect with the clicked template id', () => {
    const onSelect = vi.fn()
    const templates = [
      buildPinTemplate({ id: 't1', position: 1, title: 'First' }),
      buildPinTemplate({ id: 't2', position: 2, title: 'Second' }),
    ]
    render(
      <WorkshopTemplateList templates={templates} selectedTemplateId="t1" onSelect={onSelect} />,
    )

    fireEvent.click(screen.getByText('Second'))
    expect(onSelect).toHaveBeenCalledWith('t2')
  })
})
