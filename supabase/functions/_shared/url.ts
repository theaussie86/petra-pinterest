/**
 * Normalize an article URL for comparison and storage.
 *
 * Deno copy of `src/lib/utils.ts#normalizeUrl` — keep both in sync.
 *
 * Sitemaps and databases disagree about the trailing slash, which made every
 * article look `new` on each scrape run (issue #71). Strip the trailing slash
 * from the path (root `/` stays), drop the fragment, and lowercase the host so
 * both sides of the diff line up.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    }
    return parsed.toString()
  } catch {
    // Not an absolute URL — fall back to a plain trailing-slash strip
    return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed
  }
}
