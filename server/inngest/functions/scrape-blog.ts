import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import { scrapeSitemap, scrapeRss, scrapeHtml } from '../../lib/scraping'
import type { ArticleData } from '../../lib/scraping'

export const scrapeBlog = inngest.createFunction(
  { id: 'scrape-blog' },
  { event: 'blog/scrape.requested' },
  async ({ event, step }) => {
    const { blog_project_id, blog_url, sitemap_url, rss_url, tenant_id } = event.data

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    const errors: string[] = []

    // Step 1: Try sitemap scraping
    const sitemapResult = await step.run('scrape-sitemap', async () => {
      try {
        const articles = await scrapeSitemap(blog_url, sitemap_url || undefined)
        return { articles, error: null as string | null }
      } catch (error) {
        return { articles: [] as ArticleData[], error: String(error) as string | null }
      }
    })

    let articles = sitemapResult.articles
    let method: 'sitemap' | 'rss' | 'html' = sitemapResult.articles.length > 0 ? 'sitemap' : 'rss'

    if (sitemapResult.error) errors.push(`Sitemap failed: ${sitemapResult.error}`)

    // Step 2: RSS fallback if sitemap found no articles
    if (articles.length === 0) {
      const rssResult = await step.run('scrape-rss', async () => {
        try {
          const articles = await scrapeRss(blog_url, rss_url || undefined)
          return { articles, error: null as string | null }
        } catch (error) {
          return { articles: [] as ArticleData[], error: String(error) as string | null }
        }
      })

      articles = rssResult.articles
      method = rssResult.articles.length > 0 ? 'rss' : 'html'
      if (rssResult.error) errors.push(`RSS failed: ${rssResult.error}`)
    }

    // Step 3: HTML fallback if RSS also failed
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

