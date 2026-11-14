// Single-article scrape pipeline run by the scrape_article queue worker
// (ADR-0004, issue #90):
// normalise the URL, fetch the HTML, extract the article with Readability (no
// AI, no API key - ADR-0008), parse a robust published_at and upsert into
// blog_articles. Throws on any failure; callers decide what an error means
// (the worker mails once after the last attempt).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractArticle } from './extract-article.ts'
import { normalizeUrl } from './url.ts'
import { parsePublishedAt } from './published-at.ts'

export interface ScrapeArticleJob {
  blog_project_id: string
  url: string
  tenant_id: string
}

export async function scrapeAndStoreArticle(
  supabase: SupabaseClient,
  { blog_project_id, url: rawUrl, tenant_id }: ScrapeArticleJob,
): Promise<{ url: string; title: string }> {
  if (!blog_project_id || !rawUrl || !tenant_id) {
    throw new Error('blog_project_id, url, and tenant_id are required')
  }

  // Store the normalized URL so the next sitemap diff matches (issue #71)
  const url = normalizeUrl(rawUrl)

  // Fetch the page
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PetraPinterestBot/1.0; +http://localhost:3000)',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()

  // Readability extraction (ADR-0008); throws NoArticleFoundError instead of
  // returning an empty article
  const article = extractArticle(html, url)

  // Pages carry dates in many shapes; an unusable value must not fail the
  // whole upsert (issue #71)
  const publishedAt = parsePublishedAt(article.published_at)

  const { error: upsertError } = await supabase.from('blog_articles').upsert(
    {
      tenant_id,
      blog_project_id,
      title: article.title,
      url,
      content: article.content,
      published_at: publishedAt,
      scraped_at: new Date().toISOString(),
    },
    { onConflict: 'blog_project_id,url' },
  )

  if (upsertError) {
    throw new Error(upsertError.message)
  }

  return { url, title: article.title }
}
