/**
 * JSON repair callback for the AI SDK.
 *
 * Carries over the former `sanitizeJsonResponse` control-char logic from the
 * `@google/genai` path into the AI SDK's sanctioned `experimental_repairText`
 * slot. The native `generateObject` parse runs first; this only fires when that
 * parse (or Zod validation) fails. A fire-counter lets us measure, weeks later,
 * whether the AI SDK already fixes the Gemini flakiness so the hack can be
 * deleted (see ADR 0002 / PRD #40).
 */

import type { RepairTextFunction } from 'ai'

let repairFireCount = 0

/** How many times the repair callback has fired this process. */
export function getRepairFireCount(): number {
  return repairFireCount
}

/** Reset the fire-counter (test helper). */
export function resetRepairFireCount(): void {
  repairFireCount = 0
}

/**
 * Escape literal control characters inside JSON string values.
 *
 * Gemini sometimes emits these unescaped despite structured-output mode, which
 * causes JSON.parse to fail with "Unterminated string".
 *
 * Handles:
 * - Control characters U+0000 through U+001F (required by JSON spec)
 * - DEL character U+007F (can cause parsing issues)
 * - LINE SEPARATOR U+2028 (valid JSON but breaks JS string literals)
 * - PARAGRAPH SEPARATOR U+2029 (valid JSON but breaks JS string literals)
 * - BOM U+FEFF at start of input (strip it)
 */
export function sanitizeJsonControlChars(text: string): string {
  // Strip BOM if present at start
  let input = text
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1)
  }

  let inString = false
  let escaped = false
  let result = ''
  for (const char of input) {
    if (escaped) {
      result += char
      escaped = false
    } else if (char === '\\' && inString) {
      result += char
      escaped = true
    } else if (char === '"') {
      result += char
      inString = !inString
    } else if (inString) {
      const code = char.charCodeAt(0)
      // Escape control characters (U+0000 through U+001F)
      if (code <= 0x1f) {
        switch (char) {
          case '\n':
            result += '\\n'
            break
          case '\r':
            result += '\\r'
            break
          case '\t':
            result += '\\t'
            break
          case '\b':
            result += '\\b'
            break
          case '\f':
            result += '\\f'
            break
          default:
            // Other control characters use \uXXXX format
            result += '\\u' + code.toString(16).padStart(4, '0')
        }
      } else if (code === 0x7f) {
        // DEL character
        result += '\\u007f'
      } else if (code === 0x2028 || code === 0x2029) {
        // LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR (U+2029)
        // Valid in JSON strings but break JavaScript string literals
        result += '\\u' + code.toString(16).padStart(4, '0')
      } else {
        result += char
      }
    } else {
      result += char
    }
  }
  return result
}

/**
 * `experimental_repairText` callback for `generateObject`. Fires only when the
 * model output fails to parse/validate; increments the fire-counter and returns
 * the control-char-sanitized text for a second parse attempt.
 */
export const repairText: RepairTextFunction = async ({ text }) => {
  repairFireCount++
  return sanitizeJsonControlChars(text)
}
