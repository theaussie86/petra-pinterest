import { task } from '@trigger.dev/sdk/v3'
import { createClient } from '@supabase/supabase-js'
import { discoverSitemapUrls } from '../../server/lib/scraping'
import { scrapeSingleTask } from './scrape-single'
import { notifyProjectError } from '@/lib/server/notifications'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!

export interface ScrapeBlogPayload {
  blog_project_id: string
  blog_url: string
  sitemap_url?: string | null
  tenant_id: string
}

export const scrapeBlogTask = task({
  id: 'scrape-blog',
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: ScrapeBlogPayload) => {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Discover URLs via sitemap
    const discoveredUrls = await discoverSitemapUrls(
      payload.blog_url,
      payload.sitemap_url ?? undefined
    )

    // Diff against existing articles
    const { data: existingArticles } = await supabase
      .from('blog_articles')
      .select('url')
      .eq('blog_project_id', payload.blog_project_id)

    const existingUrls = new Set(
      (existingArticles ?? []).map((a: { url: string }) => a.url)
    )
    const newUrls = discoveredUrls.filter((url) => !existingUrls.has(url))

    if (newUrls.length === 0) {
      return { success: true, dispatched: 0, discovered: discoveredUrls.length }
    }

    // Batch trigger scrape-single for each new URL
    const batchHandle = await scrapeSingleTask.batchTrigger(
      newUrls.map((url) => ({
        payload: {
          blog_project_id: payload.blog_project_id,
          url,
          tenant_id: payload.tenant_id,
        },
      }))
    )

    // Update last_scraped_at on project
    await supabase
      .from('blog_projects')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', payload.blog_project_id)

    return {
      success: true,
      discovered: discoveredUrls.length,
      dispatched: newUrls.length,
      batchId: batchHandle.batchId,
    }
  },
  // Fires once after all retries are exhausted — perfect place for the
  // user-facing error mail (avoids one mail per retry attempt).
  onFailure: async (payload, error) => {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const errorMessage = error instanceof Error ? error.message : String(error)

    await notifyProjectError({
      supabase,
      projectId: payload.blog_project_id,
      subject: '[Pinfinity] Fehler beim Blog-Scraping',
      errorMessage,
      context: `Sitemap-Discovery für ${payload.blog_url}`,
    })
  },
})
