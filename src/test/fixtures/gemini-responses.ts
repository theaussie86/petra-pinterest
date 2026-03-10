/**
 * Real and synthetic Gemini response fixtures for testing edge cases.
 * These represent actual failure modes encountered in production.
 */

export const GEMINI_RESPONSE_FIXTURES = {
  // Valid responses
  valid: {
    simple: '{"title":"Test","description":"Desc","alt_text":"Alt"}',
    withPrettyPrint:
      '{\n  "title": "Test",\n  "description": "Desc",\n  "alt_text": "Alt"\n}',
    withGerman: '{"title":"Schlafprobleme lösen","description":"Tipps für besseren Schlaf","alt_text":"Auf diesem Pin siehst du eine Person im Bett"}',
  },

  // Control characters in strings (handled by sanitizeJsonResponse)
  controlChars: {
    newlineInTitle: '{"title":"Line 1\nLine 2","description":"D","alt_text":"A"}',
    tabInDescription:
      '{"title":"T","description":"Step 1\tStep 2\tStep 3","alt_text":"A"}',
    carriageReturnNewline:
      '{"title":"T","description":"Para 1\r\nPara 2\r\nPara 3","alt_text":"A"}',
    multipleControlChars:
      '{"title":"A\nB\rC\tD","description":"E\fF\bG","alt_text":"H"}',
    allCommonControlChars:
      '{"title":"Newline\nTab\tReturn\r","description":"Form\fBack\b","alt_text":"Alt"}',
  },

  // Unicode edge cases (the main source of "Unterminated string" errors)
  unicode: {
    lineSeparator: '{"title":"T","description":"Line\u2028Break here","alt_text":"A"}',
    paragraphSeparator:
      '{"title":"T","description":"Para\u2029Break here","alt_text":"A"}',
    mixedSeparators:
      '{"title":"Mix\u2028and\u2029here","description":"D","alt_text":"A"}',
    bomAtStart: '\uFEFF{"title":"BOM Start","description":"D","alt_text":"A"}',
    delCharacter: '{"title":"Delete\x7Fchar","description":"D","alt_text":"A"}',
    emoji: '{"title":"Pin \ud83d\ude00 Great!","description":"Awesome content!","alt_text":"A"}',
    germanUmlauts: '{"title":"Träume verstehen","description":"Schlafstörungen überwinden","alt_text":"A"}',
    zeroWidthSpace: '{"title":"Zero\u200BWidth","description":"D","alt_text":"A"}',
  },

  // Malformed responses (should fail gracefully)
  malformed: {
    truncated: '{"title":"Title","description":"This description was cut off at the',
    markdownWrapped:
      '```json\n{"title":"T","description":"D","alt_text":"A"}\n```',
    extraTextAfter:
      '{"title":"T","description":"D","alt_text":"A"}\n\nNote: This is additional context.',
    missingClosingBrace: '{"title":"T","description":"D","alt_text":"A"',
    missingClosingQuote: '{"title":"T","description":"D","alt_text":"A',
    invalidEscape: '{"title":"Bad\\qEscape","description":"D","alt_text":"A"}',
  },

  // Position-specific tests (simulating real failures at specific byte positions)
  positionSpecific: {
    // Simulate failure around position 282 (common real-world failure point)
    position282: createResponseWithCharAtPosition('\u2028', 282),
    position500: createResponseWithCharAtPosition('\n', 500),
    position50: createResponseWithCharAtPosition('\t', 50),
  },

  // Real-world failure scenarios
  realWorld: {
    // Long German description with line breaks
    germanBlog: `{
  "title": "10 Tipps für besseren Schlaf",
  "description": "Schlafprobleme sind weit verbreitet.\u2028\u2028Hier sind unsere besten Tipps:\u2028\u20281. Regelmäßige Schlafzeiten\u20282. Kein Koffein nach 14 Uhr\u20283. Bildschirmzeit reduzieren\u2028\u2028🌙 Probiere es aus!",
  "alt_text": "Auf diesem Pin siehst du eine Person, die friedlich schläft"
}`,
    // Pinterest SEO description with embedded newlines
    pinterestSeo: `{
  "title": "Easy Vegan Chocolate Cake",
  "description": "The most delicious vegan chocolate cake ever!\n\nIngredients:\n- Cocoa powder\n- Almond milk\n- Maple syrup\n\n\ud83c\udf82 Get the recipe!",
  "alt_text": "On this pin you see a slice of chocolate cake on a white plate"
}`,
  },
} as const

/**
 * Create a Gemini response with a specific character at a given position.
 * Useful for testing position-specific failures.
 */
function createResponseWithCharAtPosition(char: string, position: number): string {
  const prefix = '{"title":"'
  const suffix = '","description":"desc","alt_text":"alt"}'

  // Calculate padding needed to place char at the target position
  const paddingNeeded = position - prefix.length - 1
  if (paddingNeeded < 0) {
    // Position is within the prefix, just return a simple response
    return `{"title":"x${char}y","description":"d","alt_text":"a"}`
  }

  const padding = 'x'.repeat(paddingNeeded)
  return `${prefix}${padding}${char}${suffix}`
}

/**
 * Helper to wrap a text as a Gemini API response object
 */
export function makeGeminiResponse(text: string) {
  return { text }
}

/**
 * Type for the valid metadata response shape
 */
export type GeneratedMetadataFixture = {
  title: string
  description: string
  alt_text: string
}

/**
 * Parse a fixture string into a metadata object, applying sanitization first
 */
export function parseFixture(
  fixture: string,
  sanitize: (text: string) => string
): GeneratedMetadataFixture {
  return JSON.parse(sanitize(fixture))
}
