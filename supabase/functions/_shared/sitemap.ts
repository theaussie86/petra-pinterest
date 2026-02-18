export interface SitemapEntry {
  url: string
  lastmod?: string
}

/**
 * Discover article URLs (with optional lastmod) from a sitemap or sitemap index.
 * Uses regex-based XML parsing (no DOMParser in Deno Edge Functions).
 * Recursively follows sitemap index entries.
 * Filters to same-origin, non-homepage URLs.
 */
export async function discoverSitemapEntries(
  blogUrl: string,
  sitemapUrl?: string | null,
): Promise<SitemapEntry[]> {
  const url = sitemapUrl || new URL('/sitemap.xml', blogUrl).toString()

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; PetraPinterestBot/1.0)',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status}`)
  }

  const xml = await response.text()

  // Handle sitemap index (contains <sitemap> entries with <loc>)
  if (xml.includes('<sitemapindex')) {
    const sitemapLocs = extractLocs(xml, 'sitemap')
    const allEntries: SitemapEntry[] = []

    for (const loc of sitemapLocs) {
      try {
        const childEntries = await discoverSitemapEntries(blogUrl, loc)
        allEntries.push(...childEntries)
      } catch {
        // Continue with next sitemap
      }
    }
    return allEntries
  }

  // Handle regular urlset
  const entries = extractUrlEntries(xml)
  if (entries.length === 0) {
    throw new Error('No URLs found in sitemap')
  }

  // Filter to same-origin, non-homepage URLs
  const blogOrigin = new URL(blogUrl).origin
  return entries.filter((entry) => {
    if (!entry.url) return false
    if (entry.url === blogUrl || entry.url === blogUrl + '/') return false
    if (!entry.url.startsWith(blogOrigin)) return false
    return true
  })
}

/**
 * Extract <loc> values from sitemap index <sitemap> entries.
 */
function extractLocs(xml: string, parentTag: string): string[] {
  const locs: string[] = []
  const regex = new RegExp(
    `<${parentTag}[^>]*>[\\s\\S]*?<\\/${parentTag}>`,
    'gi',
  )
  let match
  while ((match = regex.exec(xml)) !== null) {
    const locMatch = match[0].match(/<loc>\s*(.*?)\s*<\/loc>/i)
    if (locMatch) {
      locs.push(locMatch[1].trim())
    }
  }
  return locs
}

/**
 * Extract URL entries (loc + optional lastmod) from a <urlset> sitemap.
 */
function extractUrlEntries(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = []
  const urlRegex = /<url>([\s\S]*?)<\/url>/gi
  let match
  while ((match = urlRegex.exec(xml)) !== null) {
    const block = match[1]
    const locMatch = block.match(/<loc>\s*(.*?)\s*<\/loc>/i)
    if (!locMatch) continue

    const lastmodMatch = block.match(/<lastmod>\s*(.*?)\s*<\/lastmod>/i)

    entries.push({
      url: locMatch[1].trim(),
      lastmod: lastmodMatch ? lastmodMatch[1].trim() : undefined,
    })
  }
  return entries
}
