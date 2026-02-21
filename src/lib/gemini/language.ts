const KNOWN_LANGUAGES: Record<string, string> = {
  german: 'German',
  deutsch: 'German',
  english: 'English',
  englisch: 'English',
  french: 'French',
  französisch: 'French',
  franzoesisch: 'French',
  italian: 'Italian',
  italienisch: 'Italian',
  spanish: 'Spanish',
  spanisch: 'Spanish',
}

/**
 * Sanitize a user-supplied language value for safe injection into AI prompts.
 * - Whitelists known languages (maps to canonical English name)
 * - For custom values: strips everything except [a-zA-Z\s\-], limits to 50 chars
 * - Returns null if result is empty or too short
 */
export function sanitizeLanguage(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  if (KNOWN_LANGUAGES[lower]) return KNOWN_LANGUAGES[lower]
  const safe = trimmed.replace(/[^a-zA-Z\s\-]/g, '').trim().slice(0, 50)
  return safe.length >= 2 ? safe : null
}
