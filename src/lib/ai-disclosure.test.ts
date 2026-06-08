import { buildAiDisclosures } from './ai-disclosure'

describe('buildAiDisclosures()', () => {
  it('returns both values when ai_modified and synthetic_performer are true', () => {
    expect(buildAiDisclosures(true, true)).toEqual({
      values: ['AI_MODIFIED', 'SYNTHETIC_PERFORMER'],
    })
  })

  it('returns only AI_MODIFIED when just ai_modified is true', () => {
    expect(buildAiDisclosures(true, false)).toEqual({
      values: ['AI_MODIFIED'],
    })
  })

  it('returns undefined when both are false (field omitted from payload)', () => {
    expect(buildAiDisclosures(false, false)).toBeUndefined()
  })

  it('defensively includes AI_MODIFIED when synthetic_performer is true but ai_modified is false', () => {
    expect(buildAiDisclosures(false, true)).toEqual({
      values: ['AI_MODIFIED', 'SYNTHETIC_PERFORMER'],
    })
  })
})
