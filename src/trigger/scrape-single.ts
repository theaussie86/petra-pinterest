import { task } from '@trigger.dev/sdk/v3'
import { createClient } from '@supabase/supabase-js'
import { scrapeArticleWithGemini } from '../../server/lib/gemini-scraper'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export interface ScrapeSinglePayload {
  blog_project_id: string
  url: string
  tenant_id: string
}

export const scrapeSingleTask = task({
  id: 'scrape-single',
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: ScrapeSinglePayload) => {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Gemini API key from Vault
    const { data: apiKey, error: vaultError } = await supabase.rpc(
      'get_gemini_api_key',
      { p_blog_project_id: payload.blog_project_id }
    )

    if (vaultError || !apiKey) {
      throw new Error(
        `Failed to retrieve Gemini API key: ${vaultError?.message || 'No key configured'}`
      )
    }

    // Scrape article using existing utility
    const article = await scrapeArticleWithGemini(payload.url, apiKey)

    // Gemini may return "null" as string when no date found
    const publishedAt =
      article.published_at && article.published_at !== 'null'
        ? article.published_at
        : null

    // Upsert into blog_articles
    const { error: upsertError } = await supabase
      .from('blog_articles')
      .upsert(
        {
          tenant_id: payload.tenant_id,
          blog_project_id: payload.blog_project_id,
          title: article.title,
          url: payload.url,
          content: article.content,
          published_at: publishedAt,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'blog_project_id,url' }
      )

    if (upsertError) {
      throw new Error(upsertError.message)
    }

    return {
      success: true,
      url: payload.url,
      title: article.title,
    }
  },
})
