/**
 * Deno copy of `src/lib/scraping/published-at.ts` — keep both in sync.
 */
/**
 * Coerce the model's `published_at` into something Postgres accepts.
 *
 * The article scraper occasionally emits a mangled date — `"null"` as a string,
 * a doubled value like `2026-03-1026-03-10T00:00:00Z`, or a sentence such as
 * `2024-07-17 (Updated: 2026-01-19)`. Postgres rejects those with
 * `invalid input syntax for type timestamp with time zone` and the whole scrape
 * of that article fails (issue #71). A date is worth less than the article, so
 * an unparseable value degrades to null instead of throwing.
 */
export function parsePublishedAt(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null

  // Take the first ISO-ish date in the string: handles trailing commentary and
  // the doubled-date case, where the first 10 characters are still correct.
  const match = trimmed.match(/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/)
  if (!match) return null

  const parsed = new Date(match[0])
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toISOString()
}
