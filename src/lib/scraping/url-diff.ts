import { normalizeUrl } from '@/lib/utils'

/** Sitemap entry as returned by sitemap discovery. */
export interface SitemapEntry {
  url: string
  lastmod?: string | null
}

/** Existing `blog_articles` row, reduced to the columns the diff needs. */
export interface ExistingArticle {
  url: string
  scraped_at?: string | null
}

export interface ScrapeCandidate {
  url: string
  reason: 'new' | 'updated'
}

/**
 * Diff discovered sitemap URLs against the URLs already stored for a project.
 *
 * Both sides are normalized first: sitemaps and the DB disagree about the
 * trailing slash, which made every article look new on every run (issue #71).
 * Returns the normalized URLs, so callers store what they compared against.
 */
export function filterNewUrls(
  discoveredUrls: string[],
  existingUrls: string[],
): string[] {
  const existing = new Set(existingUrls.map(normalizeUrl))
  const seen = new Set<string>()

  return discoveredUrls.map(normalizeUrl).filter((url) => {
    if (existing.has(url) || seen.has(url)) return false
    seen.add(url)
    return true
  })
}

/**
 * Decide which sitemap entries need a scrape: unknown URLs (`new`) and known
 * URLs whose `lastmod` is newer than `scraped_at` (`updated`). URL comparison
 * is slash-insensitive (issue #71).
 */
export function diffSitemapEntries(
  entries: SitemapEntry[],
  existingArticles: ExistingArticle[],
): ScrapeCandidate[] {
  // A project can hold both slash variants of the same article until the
  // normalization migration has run — keep the newest scrape of the pair, so
  // the `updated` check does not fire off the stale row.
  const existingMap = new Map<string, string | null>()
  for (const article of existingArticles) {
    const url = normalizeUrl(article.url)
    const scrapedAt = article.scraped_at ?? null
    const known = existingMap.get(url)

    if (known === undefined || isNewer(scrapedAt, known)) {
      existingMap.set(url, scrapedAt)
    }
  }

  const candidates: ScrapeCandidate[] = []
  const queued = new Set<string>()

  for (const entry of entries) {
    const url = normalizeUrl(entry.url)
    if (queued.has(url)) continue
    const existingScrapedAt = existingMap.get(url)

    if (existingScrapedAt === undefined) {
      candidates.push({ url, reason: 'new' })
      queued.add(url)
    } else if (entry.lastmod && existingScrapedAt) {
      if (new Date(entry.lastmod).getTime() > new Date(existingScrapedAt).getTime()) {
        candidates.push({ url, reason: 'updated' })
        queued.add(url)
      }
    }
  }
  return candidates
}

/** True when `a` is a later timestamp than `b`; a null timestamp is oldest. */
function isNewer(a: string | null, b: string | null): boolean {
  if (a === null) return false
  if (b === null) return true
  return new Date(a).getTime() > new Date(b).getTime()
}
