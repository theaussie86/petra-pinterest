import { parse as parseHTML } from 'node-html-parser'
import { XMLParser } from 'fast-xml-parser'

export interface ArticleData {
  title: string
  url: string
  content?: string
  published_at?: string
}

/**
 * @deprecated Use `discoverBlogUrls` from `server/lib/firecrawl.ts` instead.
 * Discover RSS feed URL from blog homepage
 */
export async function discoverRssFeed(blogUrl: string): Promise<string | null> {
  const response = await fetch(blogUrl)
  if (!response.ok) {
    return null
  }

  const html = await response.text()
  const root = parseHTML(html)

  if (!root) {
    return null
  }

  // Look for RSS/Atom link in head
  const links = root.querySelectorAll('link')
  for (const link of links) {
    const type = link.getAttribute('type')
    if (type === 'application/rss+xml' || type === 'application/atom+xml') {
      const href = link.getAttribute('href')
      if (href) {
        // Handle relative URLs
        return new URL(href, blogUrl).toString()
      }
    }
  }

  // Try common RSS paths
  const commonPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml']
  for (const path of commonPaths) {
    try {
      const feedUrl = new URL(path, blogUrl).toString()
      const feedResponse = await fetch(feedUrl, { method: 'HEAD' })
      if (feedResponse.ok) {
        return feedUrl
      }
    } catch {
      // Continue to next path
    }
  }

  return null
}

/**
 * @deprecated Use `discoverBlogUrls` + `scrapeArticlesBatch` from `server/lib/firecrawl.ts` instead.
 * Scrape sitemap.xml for article URLs
 */
export async function scrapeSitemap(blogUrl: string, sitemapUrl?: string): Promise<ArticleData[]> {
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

    const allArticles: ArticleData[] = []
    for (const sitemap of sitemaps) {
      const loc = sitemap.loc?.toString().trim()
      if (loc) {
        try {
          const childArticles = await scrapeSitemap(blogUrl, loc)
          allArticles.push(...childArticles)
        } catch {
          // Continue with next sitemap
        }
      }
    }
    return allArticles
  }

  // Handle regular urlset
  const rawUrls = parsed.urlset?.url
  if (!rawUrls) {
    throw new Error('No URLs found in sitemap')
  }

  const urls = Array.isArray(rawUrls) ? rawUrls : [rawUrls]

  // Filter to likely blog post URLs (exclude homepage)
  const blogBaseUrl = new URL(blogUrl).origin
  const articleUrls = urls
    .map(entry => ({
      loc: entry.loc?.toString().trim() as string | undefined,
      lastmod: entry.lastmod?.toString().trim() as string | undefined,
    }))
    .filter(entry => {
      if (!entry.loc) return false
      if (entry.loc === blogUrl || entry.loc === blogUrl + '/') return false
      if (!entry.loc.startsWith(blogBaseUrl)) return false
      return true
    })

  // Scrape each URL for article content
  const articles: ArticleData[] = []
  for (const entry of articleUrls) {
    try {
      const article = await scrapeSingleUrl(entry.loc!)
      if (!article.published_at && entry.lastmod) {
        article.published_at = entry.lastmod
      }
      articles.push(article)
    } catch (error) {
      console.error(`Failed to scrape ${entry.loc}: ${String(error)}`)
    }
  }

  return articles
}

/**
 * @deprecated Use `discoverBlogUrls` + `scrapeArticlesBatch` from `server/lib/firecrawl.ts` instead.
 * Scrape RSS/Atom feed
 */
export async function scrapeRss(blogUrl: string, rssUrl?: string): Promise<ArticleData[]> {
  let feedUrl: string | null = rssUrl || null

  // If no RSS URL provided, try auto-discovery
  if (!feedUrl) {
    feedUrl = await discoverRssFeed(blogUrl)
  }

  if (!feedUrl) {
    throw new Error('RSS feed URL not found')
  }

  const response = await fetch(feedUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status}`)
  }

  const xml = await response.text()
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const parsed = parser.parse(xml)

  const articles: ArticleData[] = []

  // Try RSS 2.0 format
  const rawItems = parsed.rss?.channel?.item
  if (rawItems) {
    const items = Array.isArray(rawItems) ? rawItems : [rawItems]
    for (const item of items) {
      const title = item.title?.toString().trim() || 'Untitled'
      const link = item.link?.toString().trim()
      const content = item['content:encoded']?.toString().trim() || item.description?.toString().trim()
      const pubDate = item.pubDate?.toString().trim()

      if (link) {
        articles.push({
          title,
          url: link,
          content,
          published_at: pubDate,
        })
      }
    }
  } else {
    // Try Atom format
    const rawEntries = parsed.feed?.entry
    if (rawEntries) {
      const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries]
      for (const entry of entries) {
        const title = entry.title?.toString().trim() || 'Untitled'

        // Handle link (can be string, object, or array of objects)
        let link: string | undefined
        if (typeof entry.link === 'string') {
          link = entry.link
        } else if (entry.link?.['@_href']) {
          link = entry.link['@_href']
        } else if (Array.isArray(entry.link)) {
          const alternateLink = entry.link.find((l: any) => l['@_rel'] === 'alternate')
          link = alternateLink?.['@_href'] || entry.link[0]?.['@_href']
        }

        const content = entry.content?.toString().trim() || entry.summary?.toString().trim()
        const published = entry.published?.toString().trim() || entry.updated?.toString().trim()

        if (link) {
          articles.push({
            title,
            url: link,
            content,
            published_at: published,
          })
        }
      }
    }
  }

  return articles
}

/**
 * @deprecated Use `discoverBlogUrls` + `scrapeArticlesBatch` from `server/lib/firecrawl.ts` instead.
 * Scrape blog homepage for article links (HTML fallback)
 */
export async function scrapeHtml(blogUrl: string): Promise<ArticleData[]> {
  const response = await fetch(blogUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch blog: ${response.status}`)
  }

  const html = await response.text()
  const root = parseHTML(html)

  if (!root) {
    throw new Error('Failed to parse HTML')
  }

  const articles: ArticleData[] = []
  const articleLinks = new Set<string>()

  // Look for article links in common patterns
  // Try article elements first
  const articleElements = root.querySelectorAll('article')
  for (const article of articleElements) {
    const link = article.querySelector('a')?.getAttribute('href')
    if (link) {
      const absoluteUrl = new URL(link, blogUrl).toString()
      articleLinks.add(absoluteUrl)
    }
  }

  // If no article elements, look for links in main content area
  if (articleLinks.size === 0) {
    const mainContent = root.querySelector('main') || root.querySelector('.content') || root.querySelector('#content')
    if (mainContent) {
      const links = mainContent.querySelectorAll('a')
      for (const link of links) {
        const href = link.getAttribute('href')
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try {
            const absoluteUrl = new URL(href, blogUrl).toString()
            // Only include links that seem like blog posts (same domain, not homepage)
            if (absoluteUrl.startsWith(blogUrl) && absoluteUrl !== blogUrl) {
              articleLinks.add(absoluteUrl)
            }
          } catch {
            // Invalid URL, skip
          }
        }
      }
    }
  }

  // Limit to first 20 articles to avoid overload
  const limitedLinks = Array.from(articleLinks).slice(0, 20)

  // Fetch each article
  for (const url of limitedLinks) {
    try {
      const article = await scrapeSingleUrl(url)
      articles.push(article)
    } catch (error) {
      // Individual article fetch failed, continue with others
      console.error(`Failed to scrape ${url}: ${String(error)}`)
    }
  }

  return articles
}

/**
 * @deprecated Use `scrapeArticle` from `server/lib/firecrawl.ts` instead.
 * Scrape a single URL and extract article data
 */
export async function scrapeSingleUrl(url: string): Promise<ArticleData> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  const html = await response.text()
  const root = parseHTML(html)

  if (!root) {
    throw new Error('Failed to parse HTML')
  }

  // Extract title (try h1 first, then title tag)
  let title = root.querySelector('h1')?.textContent?.trim()
  if (!title) {
    title = root.querySelector('title')?.textContent?.trim()
  }
  if (!title) {
    title = 'Untitled'
  }

  // Extract content (try article tag, then main, then body)
  let content = root.querySelector('article')?.innerHTML
  if (!content) {
    content = root.querySelector('main')?.innerHTML
  }
  if (!content) {
    content = root.querySelector('body')?.innerHTML
  }

  // Extract publish date (try time tag, then meta tags)
  let published_at: string | undefined
  const timeElement = root.querySelector('time')
  if (timeElement) {
    published_at = timeElement.getAttribute('datetime') || timeElement.textContent?.trim()
  }
  if (!published_at) {
    const metaDate = root.querySelector('meta[property="article:published_time"]')
      || root.querySelector('meta[name="publish_date"]')
      || root.querySelector('meta[name="date"]')
    if (metaDate) {
      published_at = metaDate.getAttribute('content') || undefined
    }
  }

  return {
    title,
    url,
    content,
    published_at,
  }
}
