import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import { discoverBlogUrls, scrapeArticlesBatch } from '../../lib/firecrawl'

export const scrapeBlog = inngest.createFunction(
  { id: 'scrape-blog' },
  { event: 'blog/scrape.requested' },
  async ({ event, step }) => {
    const { blog_project_id, blog_url, tenant_id } = event.data

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Step 1: Discover URLs via Firecrawl map + diff against existing articles
    const newUrls = await step.run('discover-urls', async () => {
      const discoveredUrls = await discoverBlogUrls(blog_url)

      // Fetch existing article URLs for this project
      const { data: existingArticles } = await supabase
        .from('blog_articles')
        .select('url')
        .eq('blog_project_id', blog_project_id)

      const existingUrls = new Set(
        (existingArticles ?? []).map((a: { url: string }) => a.url)
      )

      // Return only URLs we haven't scraped yet
      return discoveredUrls.filter((url) => !existingUrls.has(url))
    })

    if (newUrls.length === 0) {
      return {
        success: true,
        articles_found: 0,
        articles_created: 0,
        articles_updated: 0,
        method: 'firecrawl-map' as const,
        errors: [],
      }
    }

    // Step 2: Scrape new article URLs via Firecrawl
    const scrapeResult = await step.run('scrape-new-articles', async () => {
      return scrapeArticlesBatch(newUrls)
    })

    const articles = scrapeResult.articles
    const errors = scrapeResult.errors

    if (articles.length === 0) {
      return {
        success: false,
        articles_found: 0,
        articles_created: 0,
        articles_updated: 0,
        method: 'firecrawl-map' as const,
        errors: errors.length > 0 ? errors : ['No articles could be scraped'],
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
      method: 'firecrawl-map' as const,
      errors: [...errors, ...upsertResult.errors],
    }
  }
)
