import {
  normalizeForMatch,
  validatePinTemplate,
  hasDuplicatePositions,
  PIN_TEMPLATE_MAX_DESCRIPTION_LENGTH,
  type PinTemplateValidationInput,
} from './pin-template'

// ---------------------------------------------------------------------------
// Executable spec for the pin_templates validation rules.
//
// The DB is the enforcing authority: the external agent writes templates via
// the service role (bypassing all app code), and migration
// 00027_pin_template_validation.sql rejects invalid rows with CHECK
// constraints + the (blog_article_id, position) unique index from 00026.
//
// No live Postgres runs under vitest, so these predicates are a TS port of
// those constraints, kept in lockstep with the SQL. Each rejection rule and a
// valid (service-role) insert are proven here; the migration is written to
// mirror this module exactly.
// ---------------------------------------------------------------------------

// A fully valid template — the shape a service-role insert delivers.
function validInput(over: Partial<PinTemplateValidationInput> = {}): PinTemplateValidationInput {
  return {
    position: 1,
    main_keyword: 'cozy reading nook',
    overlay: '5 ideas for a\nCozy Reading Nook\nyou will love',
    description: 'Cozy reading nook ideas that turn any corner into a retreat.',
    ...over,
  }
}

describe('normalizeForMatch()', () => {
  it('lower-cases, collapses whitespace runs and trims (mirrors the SQL)', () => {
    expect(normalizeForMatch('  Cozy   Reading\nNook  ')).toBe('cozy reading nook')
  })
})

describe('validatePinTemplate() — valid service-role insert', () => {
  it('returns no errors for a fully valid template', () => {
    expect(validatePinTemplate(validInput())).toEqual([])
  })

  it('accepts a template without a description (120 legacy templates omit it)', () => {
    expect(validatePinTemplate(validInput({ description: null }))).toEqual([])
  })
})

describe('validatePinTemplate() — position 1..30', () => {
  it('rejects position 0', () => {
    expect(validatePinTemplate(validInput({ position: 0 }))).toContain('position_out_of_range')
  })

  it('rejects position 31', () => {
    expect(validatePinTemplate(validInput({ position: 31 }))).toContain('position_out_of_range')
  })

  it('accepts the boundaries 1 and 30', () => {
    expect(validatePinTemplate(validInput({ position: 1 }))).not.toContain('position_out_of_range')
    expect(validatePinTemplate(validInput({ position: 30 }))).not.toContain('position_out_of_range')
  })
})

describe('validatePinTemplate() — description max 500 chars', () => {
  it('rejects a description over 500 characters', () => {
    const overlay = 'x '.repeat(300) + 'keyword'
    const long = 'keyword ' + 'a'.repeat(500)
    expect(
      validatePinTemplate(validInput({ main_keyword: 'keyword', overlay, description: long }))
    ).toContain('description_too_long')
  })

  it('accepts a description of exactly 500 characters', () => {
    const main = 'keyword'
    const description = main + ' ' + 'a'.repeat(PIN_TEMPLATE_MAX_DESCRIPTION_LENGTH - main.length - 1)
    expect(description.length).toBe(PIN_TEMPLATE_MAX_DESCRIPTION_LENGTH)
    expect(
      validatePinTemplate(validInput({ main_keyword: main, overlay: 'keyword here', description }))
    ).not.toContain('description_too_long')
  })
})

describe('validatePinTemplate() — main keyword literally in overlay', () => {
  it('rejects when the keyword is absent from the overlay', () => {
    expect(
      validatePinTemplate(validInput({ main_keyword: 'garden bench', overlay: 'a different overlay line' }))
    ).toContain('keyword_not_in_overlay')
  })

  it('matches case-insensitively and ignores whitespace differences', () => {
    expect(
      validatePinTemplate(
        validInput({ main_keyword: 'Cozy   Reading Nook', overlay: 'top: cozy reading nook tips' })
      )
    ).not.toContain('keyword_not_in_overlay')
  })

  it('rejects when the overlay is missing', () => {
    expect(validatePinTemplate(validInput({ overlay: null }))).toContain('keyword_not_in_overlay')
  })
})

describe('validatePinTemplate() — description begins with main keyword', () => {
  it('rejects when the description does not start with the keyword', () => {
    expect(
      validatePinTemplate(
        validInput({
          main_keyword: 'cozy reading nook',
          overlay: 'cozy reading nook',
          description: 'Ideas for a cozy reading nook you will love.',
        })
      )
    ).toContain('description_not_starting_with_keyword')
  })

  it('accepts when the description starts with the keyword (normalized)', () => {
    expect(
      validatePinTemplate(
        validInput({
          main_keyword: 'Cozy Reading Nook',
          overlay: 'cozy reading nook',
          description: '  cozy   reading nook — a calm corner.',
        })
      )
    ).not.toContain('description_not_starting_with_keyword')
  })
})

describe('hasDuplicatePositions() — unique (blog_article_id, position)', () => {
  it('flags a duplicate position within the same article', () => {
    expect(
      hasDuplicatePositions([
        { blog_article_id: 'a1', position: 1 },
        { blog_article_id: 'a1', position: 1 },
      ])
    ).toBe(true)
  })

  it('allows the same position across different articles', () => {
    expect(
      hasDuplicatePositions([
        { blog_article_id: 'a1', position: 1 },
        { blog_article_id: 'a2', position: 1 },
      ])
    ).toBe(false)
  })
})
