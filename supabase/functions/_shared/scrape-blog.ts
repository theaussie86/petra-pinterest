// Blog-scan pipeline shared by the scrape_blog queue worker (ADR-0004, issue
// #91). Mirrors the old scrape-blog Edge Function's discovery, but instead of
// fanning out HTTP calls it batch-enqueues every new + changed article into the
// scrape_article queue and drops the 25-URL cap. Throws on any failure; the
// worker mails once after the last attempt.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { discoverSitemapEntries } from './sitemap.ts'
import { diffSitemapEntries } from './url-diff.ts'

export interface ScrapeBlogJob {
  blog_project_id: string
  tenant_id: string
}

export interface ScrapeBlogResult {
  new_count: number
  updated_count: number
  enqueued: number
}

export async function discoverAndEnqueueBlogScrape(
  supabase: SupabaseClient,
  { blog_project_id, tenant_id }: ScrapeBlogJob,
): Promise<ScrapeBlogResult> {
  if (!blog_project_id || !tenant_id) {
    throw new Error('blog_project_id and tenant_id are required')
  }

  // 1. Fetch the project's blog_url and sitemap_url
  const { data: project, error: projectError } = await supabase
    .from('blog_projects')
    .select('blog_url, sitemap_url')
    .eq('id', blog_project_id)
    .single()

  if (projectError || !project) {
    throw new Error(`Failed to fetch project: ${projectError?.message || 'Not found'}`)
  }

  // 2. Discover sitemap entries with lastmod
  const entries = await discoverSitemapEntries(project.blog_url, project.sitemap_url)

  // 3. Existing articles for the slash-insensitive diff (issue #71)
  const { data: existingArticles, error: articlesError } = await supabase
    .from('blog_articles')
    .select('url, scraped_at')
    .eq('blog_project_id', blog_project_id)

  if (articlesError) {
    throw new Error(`Failed to fetch existing articles: ${articlesError.message}`)
  }

  // 4. New + changed URLs, no upper bound (was capped at 25 in the old function)
  const candidates = diffSitemapEntries(entries, existingArticles || [])
  const newCount = candidates.filter((c) => c.reason === 'new').length
  const updatedCount = candidates.filter((c) => c.reason === 'updated').length

  console.log(
    `[scrape-blog] Project ${blog_project_id}: ${entries.length} sitemap entries, ` +
      `${(existingArticles || []).length} existing, ${newCount} new, ${updatedCount} updated`,
  )

  // 5. Batch-enqueue one scrape_article message per candidate
  if (candidates.length > 0) {
    const { error: enqueueError } = await supabase.rpc('queue_send_batch', {
      p_queue: 'scrape_article',
      p_messages: candidates.map((c) => ({
        blog_project_id,
        url: c.url,
        tenant_id,
      })),
    })
    if (enqueueError) {
      throw new Error(`Failed to enqueue articles: ${enqueueError.message}`)
    }
  }

  // 6. Mark the project scanned. A failure here only causes a harmless re-scan
  // on the next run, so it does not fail the job (which would re-enqueue).
  const { error: updateError } = await supabase
    .from('blog_projects')
    .update({ last_scraped_at: new Date().toISOString() })
    .eq('id', blog_project_id)
  if (updateError) {
    console.error(`[scrape-blog] Failed to set last_scraped_at for ${blog_project_id}:`, updateError.message)
  }

  return { new_count: newCount, updated_count: updatedCount, enqueued: candidates.length }
}
