import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import { parse as parseHTML } from 'node-html-parser'
import { XMLParser } from 'fast-xml-parser'

interface ScrapeBlogEvent {
  data: {
    blog_project_id: string
    blog_url: string
    rss_url?: string | null
    tenant_id: string
  }
}

interface ArticleData {
  title: string
  url: string
  content?: string
  published_at?: string
}

export const scrapeBlog = inngest.createFunction(
  { id: 'scrape-blog' },
  { event: 'blog/scrape.requested' },
  async ({ event, step }) => {
    const { blog_project_id, blog_url, rss_url, tenant_id } = event.data

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Step 1: Try RSS scraping
    const rssResult = await step.run('scrape-rss', async () => {
      try {
        const articles = await scrapeRss(blog_url, rss_url || undefined)
        return { articles, method: 'rss' as const, error: null as string | null }
      } catch (error) {
        return { articles: [] as ArticleData[], method: 'rss' as const, error: String(error) as string | null }
      }
    })

    // Step 2: HTML fallback if RSS failed
    let articles = rssResult.articles
    let method: 'rss' | 'html' = rssResult.articles.length > 0 ? 'rss' : 'html'
    const errors: string[] = []

    if (rssResult.error) errors.push(`RSS failed: ${rssResult.error}`)

    if (articles.length === 0) {
      const htmlResult = await step.run('scrape-html', async () => {
        try {
          return { articles: await scrapeHtml(blog_url), error: null as string | null }
        } catch (error) {
          return { articles: [] as ArticleData[], error: String(error) as string | null }
        }
      })
      articles = htmlResult.articles
      if (htmlResult.error) errors.push(`HTML scraping failed: ${htmlResult.error}`)
    }

    if (articles.length === 0) {
      return {
        success: false,
        articles_found: 0,
        articles_created: 0,
        articles_updated: 0,
        method,
        errors: errors.length > 0 ? errors : ['No articles found'],
      }
    }

    // Step 3: Upsert articles to database
    const upsertResult = await step.run('upsert-articles', async () => {
      let created = 0
      let updated = 0
      const upsertErrors: string[] = []

      for (const article of articles) {
        try {
          const { data: existing } = await supabase
            .from('blog_articles')
            .select('id')
            .eq('blog_project_id', blog_project_id)
            .eq('url', article.url)
            .single()

          const { error: upsertError } = await supabase
            .from('blog_articles')
            .upsert({
              tenant_id,
              blog_project_id,
              title: article.title,
              url: article.url,
              content: article.content,
              published_at: article.published_at,
              scraped_at: new Date().toISOString(),
            }, {
              onConflict: 'blog_project_id,url',
            })

          if (upsertError) {
            upsertErrors.push(`Failed to upsert ${article.url}: ${upsertError.message}`)
          } else {
            if (existing) updated++
            else created++
          }
        } catch (error) {
          upsertErrors.push(`Error processing ${article.url}: ${String(error)}`)
        }
      }

      return { created, updated, errors: upsertErrors }
    })

    return {
      success: true,
      articles_found: articles.length,
      articles_created: upsertResult.created,
      articles_updated: upsertResult.updated,
      method,
      errors: [...errors, ...upsertResult.errors],
    }
  }
)

/**
 * Discover RSS feed URL from blog homepage
 */
async function discoverRssFeed(blogUrl: string): Promise<string | null> {
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
 * Scrape RSS/Atom feed
 */
async function scrapeRss(blogUrl: string, rssUrl?: string): Promise<ArticleData[]> {
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
 * Scrape blog homepage for article links (HTML fallback)
 */
async function scrapeHtml(blogUrl: string): Promise<ArticleData[]> {
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
 * Scrape a single URL and extract article data
 */
async function scrapeSingleUrl(url: string): Promise<ArticleData> {
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

// Export helper functions for use by scrape-single.ts and server/index.ts
export { scrapeRss, scrapeHtml, scrapeSingleUrl, discoverRssFeed }
