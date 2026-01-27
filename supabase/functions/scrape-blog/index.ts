import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types for request and response
interface ScrapeRequest {
  blog_project_id: string
  blog_url: string
  rss_url?: string
  single_url?: string
}

interface ScrapeResponse {
  success: boolean
  articles_found: number
  articles_created: number
  articles_updated: number
  method?: 'rss' | 'html' | 'single'
  errors: string[]
}

interface Article {
  title: string
  url: string
  content?: string
  published_at?: string
}

// CORS headers for SPA access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { blog_project_id, blog_url, rss_url, single_url } = await req.json() as ScrapeRequest

    if (!blog_project_id || !blog_url) {
      return new Response(
        JSON.stringify({ success: false, errors: ['blog_project_id and blog_url are required'] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user JWT from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, errors: ['Missing Authorization header'] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user's JWT (RLS applies)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get user's tenant_id from profile
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, errors: ['Unauthorized'] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, errors: ['Profile not found'] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tenant_id = profile.tenant_id

    // MODE A: Single URL (manual add)
    if (single_url) {
      try {
        const article = await scrapeSingleUrl(single_url)

        const { error: upsertError } = await supabaseClient
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
          return new Response(
            JSON.stringify({ success: false, errors: [upsertError.message] }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const response: ScrapeResponse = {
          success: true,
          articles_found: 1,
          articles_created: 1, // Could be 0 if updated, but we don't track that detail
          articles_updated: 0,
          method: 'single',
          errors: [],
        }

        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            articles_found: 0,
            articles_created: 0,
            articles_updated: 0,
            method: 'single',
            errors: [error.message],
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // MODE B: Full scrape (blog index)
    let articles: Article[] = []
    let method: 'rss' | 'html' = 'html'
    const errors: string[] = []

    // Try RSS first
    try {
      articles = await scrapeRss(blog_url, rss_url)
      if (articles.length > 0) {
        method = 'rss'
      }
    } catch (error) {
      errors.push(`RSS failed: ${error.message}`)
    }

    // HTML fallback if RSS failed or returned no articles
    if (articles.length === 0) {
      try {
        articles = await scrapeHtml(blog_url)
        method = 'html'
      } catch (error) {
        errors.push(`HTML scraping failed: ${error.message}`)
      }
    }

    if (articles.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          articles_found: 0,
          articles_created: 0,
          articles_updated: 0,
          errors: errors.length > 0 ? errors : ['No articles found'],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert articles
    let created = 0
    let updated = 0

    for (const article of articles) {
      try {
        // Check if article exists
        const { data: existing } = await supabaseClient
          .from('blog_articles')
          .select('id')
          .eq('blog_project_id', blog_project_id)
          .eq('url', article.url)
          .single()

        const { error: upsertError } = await supabaseClient
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
          errors.push(`Failed to upsert ${article.url}: ${upsertError.message}`)
        } else {
          if (existing) {
            updated++
          } else {
            created++
          }
        }
      } catch (error) {
        errors.push(`Error processing ${article.url}: ${error.message}`)
      }
    }

    const response: ScrapeResponse = {
      success: true,
      articles_found: articles.length,
      articles_created: created,
      articles_updated: updated,
      method,
      errors,
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, errors: [error.message] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Scrape a single URL and extract article data
 */
async function scrapeSingleUrl(url: string): Promise<Article> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  const html = await response.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  if (!doc) {
    throw new Error('Failed to parse HTML')
  }

  // Extract title (try h1 first, then title tag)
  let title = doc.querySelector('h1')?.textContent?.trim()
  if (!title) {
    title = doc.querySelector('title')?.textContent?.trim()
  }
  if (!title) {
    title = 'Untitled'
  }

  // Extract content (try article tag, then main, then body)
  let content = doc.querySelector('article')?.innerHTML
  if (!content) {
    content = doc.querySelector('main')?.innerHTML
  }
  if (!content) {
    content = doc.querySelector('body')?.innerHTML
  }

  // Extract publish date (try time tag, then meta tags)
  let published_at: string | undefined
  const timeElement = doc.querySelector('time')
  if (timeElement) {
    published_at = timeElement.getAttribute('datetime') || timeElement.textContent?.trim()
  }
  if (!published_at) {
    const metaDate = doc.querySelector('meta[property="article:published_time"]')
      || doc.querySelector('meta[name="publish_date"]')
      || doc.querySelector('meta[name="date"]')
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

/**
 * Scrape RSS/Atom feed
 */
async function scrapeRss(blog_url: string, rss_url?: string): Promise<Article[]> {
  let feedUrl = rss_url

  // If no RSS URL provided, try auto-discovery
  if (!feedUrl) {
    feedUrl = await discoverRssFeed(blog_url)
  }

  if (!feedUrl) {
    throw new Error('RSS feed URL not found')
  }

  const response = await fetch(feedUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status}`)
  }

  const xml = await response.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  if (!doc) {
    throw new Error('Failed to parse RSS feed')
  }

  const articles: Article[] = []

  // Try RSS 2.0 format
  const items = doc.querySelectorAll('item')
  if (items.length > 0) {
    items.forEach((item) => {
      const title = item.querySelector('title')?.textContent?.trim() || 'Untitled'
      const link = item.querySelector('link')?.textContent?.trim()
      const content = item.querySelector('content\\:encoded')?.textContent?.trim()
        || item.querySelector('description')?.textContent?.trim()
      const pubDate = item.querySelector('pubDate')?.textContent?.trim()

      if (link) {
        articles.push({
          title,
          url: link,
          content,
          published_at: pubDate,
        })
      }
    })
  } else {
    // Try Atom format
    const entries = doc.querySelectorAll('entry')
    entries.forEach((entry) => {
      const title = entry.querySelector('title')?.textContent?.trim() || 'Untitled'
      const link = entry.querySelector('link')?.getAttribute('href')
      const content = entry.querySelector('content')?.textContent?.trim()
        || entry.querySelector('summary')?.textContent?.trim()
      const published = entry.querySelector('published')?.textContent?.trim()
        || entry.querySelector('updated')?.textContent?.trim()

      if (link) {
        articles.push({
          title,
          url: link,
          content,
          published_at: published,
        })
      }
    })
  }

  return articles
}

/**
 * Discover RSS feed URL from blog homepage
 */
async function discoverRssFeed(blog_url: string): Promise<string | null> {
  const response = await fetch(blog_url)
  if (!response.ok) {
    return null
  }

  const html = await response.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  if (!doc) {
    return null
  }

  // Look for RSS/Atom link in head
  const rssLink = doc.querySelector('link[type="application/rss+xml"]')
    || doc.querySelector('link[type="application/atom+xml"]')

  if (rssLink) {
    const href = rssLink.getAttribute('href')
    if (href) {
      // Handle relative URLs
      return new URL(href, blog_url).toString()
    }
  }

  // Try common RSS paths
  const commonPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml']
  for (const path of commonPaths) {
    try {
      const feedUrl = new URL(path, blog_url).toString()
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
 * Scrape blog homepage for article links (HTML fallback)
 */
async function scrapeHtml(blog_url: string): Promise<Article[]> {
  const response = await fetch(blog_url)
  if (!response.ok) {
    throw new Error(`Failed to fetch blog: ${response.status}`)
  }

  const html = await response.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  if (!doc) {
    throw new Error('Failed to parse HTML')
  }

  const articles: Article[] = []
  const articleLinks = new Set<string>()

  // Look for article links in common patterns
  // Try article elements first
  const articleElements = doc.querySelectorAll('article')
  articleElements.forEach((article) => {
    const link = article.querySelector('a')?.getAttribute('href')
    if (link) {
      const absoluteUrl = new URL(link, blog_url).toString()
      articleLinks.add(absoluteUrl)
    }
  })

  // If no article elements, look for links in main content area
  if (articleLinks.size === 0) {
    const mainContent = doc.querySelector('main') || doc.querySelector('.content') || doc.querySelector('#content')
    if (mainContent) {
      const links = mainContent.querySelectorAll('a')
      links.forEach((link) => {
        const href = link.getAttribute('href')
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try {
            const absoluteUrl = new URL(href, blog_url).toString()
            // Only include links that seem like blog posts (same domain, not homepage)
            if (absoluteUrl.startsWith(blog_url) && absoluteUrl !== blog_url) {
              articleLinks.add(absoluteUrl)
            }
          } catch {
            // Invalid URL, skip
          }
        }
      })
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
      console.error(`Failed to scrape ${url}: ${error.message}`)
    }
  }

  return articles
}
