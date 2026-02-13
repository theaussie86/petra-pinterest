import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import { discoverSitemapUrls } from '../../lib/scraping'

export const scrapeBlog = inngest.createFunction(
  { id: 'scrape-blog' },
  { event: 'blog/scrape.requested' },
  async ({ event, step }) => {
    const { blog_project_id, blog_url, sitemap_url, tenant_id } = event.data

    // Create Supabase client with service role
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Step 1: Discover URLs via sitemap + diff against existing articles
    const newUrls = await step.run('discover-urls', async () => {
      const discoveredUrls = await discoverSitemapUrls(blog_url, sitemap_url ?? undefined)

      // Fetch existing article URLs for this project
      const { data: existingArticles } = await supabase
        .from('blog_articles')
        .select('url')
        .eq('blog_project_id', blog_project_id)

      const existingUrls = new Set(
        (existingArticles ?? []).map((a: { url: string }) => a.url)
      )

      return discoveredUrls.filter((url) => !existingUrls.has(url))
    })

    if (newUrls.length === 0) {
      return { dispatched: 0 }
    }

    // Step 2: Fan out — send one scrape-single event per new URL
    await step.sendEvent(
      'fan-out-scrape',
      newUrls.map((url) => ({
        name: 'blog/scrape-single.requested' as const,
        data: { blog_project_id, url, tenant_id },
      }))
    )

    return { dispatched: newUrls.length }
  }
)
