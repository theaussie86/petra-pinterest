import {
  repairText,
  sanitizeJsonControlChars,
  getRepairFireCount,
  resetRepairFireCount,
} from './repair'
import { GEMINI_RESPONSE_FIXTURES } from '@/test/fixtures/gemini-responses'

const dummyError = new SyntaxError('Unterminated string') as unknown as Parameters<
  typeof repairText
>[0]['error']

beforeEach(() => {
  resetRepairFireCount()
})

describe('sanitizeJsonControlChars()', () => {
  it('passes valid JSON through untouched', () => {
    const input = '{"title":"Test","value":123,"flag":true}'
    expect(sanitizeJsonControlChars(input)).toBe(input)
  })

  it('escapes literal control chars so the result parses', () => {
    const broken = '{"text":"line\nbreak"}'
    expect(() => JSON.parse(broken)).toThrow()
    const fixed = sanitizeJsonControlChars(broken)
    expect(JSON.parse(fixed).text).toBe('line\nbreak')
  })

  it('repairs every malformed control-char / unicode fixture to valid JSON', () => {
    const fixtures = [
      ...Object.values(GEMINI_RESPONSE_FIXTURES.controlChars),
      ...Object.values(GEMINI_RESPONSE_FIXTURES.unicode),
    ]
    for (const raw of fixtures) {
      const fixed = sanitizeJsonControlChars(raw)
      expect(() => JSON.parse(fixed)).not.toThrow()
    }
  })
})

describe('repairText callback', () => {
  it('repairs malformed model output and returns parseable JSON', async () => {
    const broken = GEMINI_RESPONSE_FIXTURES.controlChars.newlineInTitle
    const repaired = await repairText({ text: broken, error: dummyError })
    expect(repaired).not.toBeNull()
    expect(JSON.parse(repaired as string).title).toBe('Line 1\nLine 2')
  })

  it('increments the fire-counter only when it actually fires', async () => {
    expect(getRepairFireCount()).toBe(0)
    // Pure sanitize does not count as a fire
    sanitizeJsonControlChars('{"a":"b"}')
    expect(getRepairFireCount()).toBe(0)

    await repairText({ text: '{"a":"b\nc"}', error: dummyError })
    expect(getRepairFireCount()).toBe(1)
    await repairText({ text: '{"a":"b"}', error: dummyError })
    expect(getRepairFireCount()).toBe(2)
  })
})
