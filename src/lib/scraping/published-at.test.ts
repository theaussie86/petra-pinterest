import { parsePublishedAt } from './published-at'

describe('parsePublishedAt()', () => {
  it('accepts a plain ISO date', () => {
    expect(parsePublishedAt('2024-09-16')).toBe('2024-09-16T00:00:00.000Z')
  })

  it('accepts a full timestamp', () => {
    expect(parsePublishedAt('2024-09-16T10:30:00Z')).toBe('2024-09-16T10:30:00.000Z')
  })

  it('rescues the doubled date the model sometimes emits', () => {
    expect(parsePublishedAt('2026-03-1026-03-10T00:00:00Z')).toBe('2026-03-10T00:00:00.000Z')
  })

  it('rescues a date followed by commentary', () => {
    expect(parsePublishedAt('2024-07-17 (Updated: 2026-01-19) or simply 2024-07-17')).toBe(
      '2024-07-17T00:00:00.000Z',
    )
  })

  it('treats the string "null" as no date', () => {
    expect(parsePublishedAt('null')).toBeNull()
    expect(parsePublishedAt('NULL')).toBeNull()
  })

  it('returns null for empty, missing and unparseable values', () => {
    expect(parsePublishedAt('')).toBeNull()
    expect(parsePublishedAt('   ')).toBeNull()
    expect(parsePublishedAt(null)).toBeNull()
    expect(parsePublishedAt(undefined)).toBeNull()
    expect(parsePublishedAt('irgendwann im Frühling')).toBeNull()
  })

  it('returns null for a syntactically valid but impossible date', () => {
    expect(parsePublishedAt('2024-13-45')).toBeNull()
  })
})
