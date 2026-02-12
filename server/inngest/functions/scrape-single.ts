import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import { scrapeArticleWithGemini } from '../../lib/gemini-scraper'

export const scrapeSingle = inngest.createFunction(
  { id: 'scrape-single-article' },
  { event: 'blog/scrape-single.requested' },
  async ({ event, step }) => {
    const { blog_project_id, url, tenant_id } = event.data

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    const result = await step.run('scrape-and-upsert', async () => {
      const article = await scrapeArticleWithGemini(url)

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
        throw new Error(upsertError.message)
      }

      return {
        success: true,
        articles_found: 1,
        articles_created: 1,
        articles_updated: 0,
        method: 'gemini-fetch' as const,
        errors: [],
      }
    })

    return result
  }
)
