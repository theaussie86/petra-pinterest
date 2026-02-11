import Firecrawl from '@mendable/firecrawl-js'
import type { ArticleData } from './scraping'

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY,
})

/**
 * Discover all blog article URLs using Firecrawl's map endpoint.
 * Filters to same-origin, non-homepage URLs.
 */
export async function discoverBlogUrls(
  blogUrl: string,
  options?: { limit?: number },
): Promise<string[]> {
  const origin = new URL(blogUrl).origin

  const result = await firecrawl.map(blogUrl, {
    limit: options?.limit ?? 5000,
  })

  // result.links is SearchResultWeb[] with { url, title?, ... }
  const links = result.links ?? []

  return links
    .map((link) => link.url)
    .filter((linkUrl): linkUrl is string => {
      if (!linkUrl) return false
      try {
        const parsed = new URL(linkUrl)
        // Same origin, not the homepage
        return (
          parsed.origin === origin &&
          parsed.pathname !== '/' &&
          parsed.pathname !== ''
        )
      } catch {
        return false
      }
    })
}

/**
 * Scrape a single article URL using Firecrawl.
 * Returns cleaned ArticleData with markdown content.
 */
export async function scrapeArticle(url: string): Promise<ArticleData> {
  const result = await firecrawl.scrape(url, {
    formats: ['markdown', 'html'],
    onlyMainContent: true,
  })

  const title =
    result.metadata?.title ||
    result.metadata?.ogTitle ||
    'Untitled'

  const published_at =
    result.metadata?.publishedTime ||
    result.metadata?.modifiedTime ||
    undefined

  return {
    title,
    url: result.metadata?.url || url,
    content: result.markdown || result.html || undefined,
    published_at,
  }
}

/**
 * Scrape multiple article URLs sequentially with a delay between requests.
 * Returns successfully scraped articles and collects errors.
 */
export async function scrapeArticlesBatch(
  urls: string[],
  options?: { delayMs?: number },
): Promise<{ articles: ArticleData[]; errors: string[] }> {
  const delayMs = options?.delayMs ?? 200
  const articles: ArticleData[] = []
  const errors: string[] = []

  for (const url of urls) {
    try {
      const article = await scrapeArticle(url)
      articles.push(article)
    } catch (error) {
      errors.push(`Failed to scrape ${url}: ${String(error)}`)
    }

    // Rate-limit delay between requests
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return { articles, errors }
}
