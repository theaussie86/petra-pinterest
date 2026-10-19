import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ImpressumContent,
  DatenschutzContent,
  AgbContent,
} from './legal-content'

afterEach(cleanup)

describe('ImpressumContent', () => {
  it('names the provider Christoph Weissteiner / Weissteiner Automation', () => {
    const { container } = render(<ImpressumContent />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Christoph Weissteiner/)
    expect(text).toMatch(/Weissteiner Automation/)
  })

  it('leaves placeholders for address, e-mail and VAT id', () => {
    const { container } = render(<ImpressumContent />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Anschrift/i)
    expect(text).toMatch(/E-?Mail/i)
    expect(text).toMatch(/USt/i)
    // Unfilled placeholders are marked so they are easy to find before go-live.
    expect(text).toMatch(/\[/)
  })
})

describe('DatenschutzContent', () => {
  it('lists the responsible party, processors and data subject rights', () => {
    const { container } = render(<DatenschutzContent />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Verantwortlich/i)
    expect(text).toMatch(/Supabase/)
    expect(text).toMatch(/Vercel/)
    expect(text).toMatch(/Google/)
    expect(text).toMatch(/Pinterest/)
    expect(text).toMatch(/Rechte/i)
  })

  it('warns that using external AI clients is the user\'s own responsibility', () => {
    const { container } = render(<DatenschutzContent />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/KI/)
    expect(text).toMatch(/eigene[rn]? Verantwortung/i)
  })
})

describe('AgbContent', () => {
  it('states Pinfinity only provides the interface and AI provider terms apply', () => {
    const { container } = render(<AgbContent />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Schnittstelle/)
    expect(text).toMatch(/OpenAI|Anthropic/)
  })

  it('makes the user responsible for her agents including scheduled pins', () => {
    const { container } = render(<AgbContent />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/verantwortlich/i)
    expect(text).toMatch(/geplante[rn]? Pins/i)
  })

  it('covers revocation, availability and limited liability', () => {
    const { container } = render(<AgbContent />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Widerruf/i)
    expect(text).toMatch(/Einstellungen/)
    expect(text).toMatch(/Verfügbarkeit/i)
    expect(text).toMatch(/Haftung/i)
  })
})
