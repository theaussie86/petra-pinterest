import { sketchPalette, scrollStopperWords, textAtBottom } from './workshop-pin-sketch'

describe('sketchPalette', () => {
  it('maps lightest to panel, darkest to ink, the middle color to accent', () => {
    expect(sketchPalette(['#C0653A', '#FBF6EE', '#2F3B45'])).toEqual({
      panel: '#FBF6EE',
      ink: '#2F3B45',
      accent: '#C0653A',
    })
  })

  it('ignores non-hex values and falls back to neutrals', () => {
    const palette = sketchPalette(['terrakotta', '#fff'])
    expect(palette.panel).toBe('#fff')
    expect(palette.ink).toBe('#1f1a2e')
  })
})

describe('scrollStopperWords', () => {
  it('extracts the uppercase words of the note', () => {
    expect(scrollStopperWords('Wort AUSTAUSCHBAR in Terrakotta')).toEqual(['AUSTAUSCHBAR'])
    expect(scrollStopperWords(undefined)).toEqual([])
  })
})

describe('textAtBottom', () => {
  it('detects a text panel placed at the bottom', () => {
    expect(textAtBottom('Foto oben, Textfeld unten über die volle Breite')).toBe(true)
    expect(textAtBottom('Textfeld oben links über 45 Prozent der Breite')).toBe(false)
    expect(textAtBottom(undefined)).toBe(false)
  })
})
