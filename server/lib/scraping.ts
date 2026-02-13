import { XMLParser } from 'fast-xml-parser'

export interface ArticleData {
  title: string
  url: string
  content?: string
  published_at?: string
}

/**
 * Discover article URLs from a sitemap (or sitemap index).
 * Recursively follows sitemap index entries. Filters to same-origin, non-homepage URLs.
 */
export async function discoverSitemapUrls(
  blogUrl: string,
  sitemapUrl?: string,
): Promise<string[]> {
  const url = sitemapUrl || new URL('/sitemap.xml', blogUrl).toString()

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status}`)
  }

  const xml = await response.text()
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const parsed = parser.parse(xml)

  // Handle sitemap index (contains references to other sitemaps)
  if (parsed.sitemapindex?.sitemap) {
    const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap]

    const allUrls: string[] = []
    for (const sitemap of sitemaps) {
      const loc = sitemap.loc?.toString().trim()
      if (loc) {
        try {
          const childUrls = await discoverSitemapUrls(blogUrl, loc)
          allUrls.push(...childUrls)
        } catch {
          // Continue with next sitemap
        }
      }
    }
    return allUrls
  }

  // Handle regular urlset
  const rawUrls = parsed.urlset?.url
  if (!rawUrls) {
    throw new Error('No URLs found in sitemap')
  }

  const urls = Array.isArray(rawUrls) ? rawUrls : [rawUrls]

  // Filter to likely blog post URLs (same origin, exclude homepage)
  const blogBaseUrl = new URL(blogUrl).origin
  return urls
    .map((entry) => entry.loc?.toString().trim() as string | undefined)
    .filter((loc): loc is string => {
      if (!loc) return false
      if (loc === blogUrl || loc === blogUrl + '/') return false
      if (!loc.startsWith(blogBaseUrl)) return false
      return true
    })
}
