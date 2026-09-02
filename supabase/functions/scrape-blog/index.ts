import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { discoverSitemapEntries } from '../_shared/sitemap.ts'
import { diffSitemapEntries } from '../_shared/url-diff.ts'

interface ScrapeRequest {
  blog_project_id: string
  tenant_id: string
}

const BATCH_SIZE = 5
const MAX_URLS_PER_RUN = 25

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { blog_project_id, tenant_id } =
      (await req.json()) as ScrapeRequest

    if (!blog_project_id || !tenant_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'blog_project_id and tenant_id are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabase = createServiceClient()

    // 1. Fetch the project's blog_url and sitemap_url
    const { data: project, error: projectError } = await supabase
      .from('blog_projects')
      .select('blog_url, sitemap_url')
      .eq('id', blog_project_id)
      .single()

    if (projectError || !project) {
      throw new Error(
        `Failed to fetch project: ${projectError?.message || 'Not found'}`,
      )
    }

    // 2. Discover sitemap entries with lastmod
    const entries = await discoverSitemapEntries(
      project.blog_url,
      project.sitemap_url,
    )

    // 3. Query existing blog_articles for this project
    const { data: existingArticles, error: articlesError } = await supabase
      .from('blog_articles')
      .select('url, scraped_at')
      .eq('blog_project_id', blog_project_id)

    if (articlesError) {
      throw new Error(
        `Failed to fetch existing articles: ${articlesError.message}`,
      )
    }

    // 4. Determine which URLs to scrape (slash-insensitive, issue #71)
    const urlsToScrape = diffSitemapEntries(entries, existingArticles || [])

    // Cap at MAX_URLS_PER_RUN
    const capped = urlsToScrape.slice(0, MAX_URLS_PER_RUN)
    const newCount = capped.filter((u) => u.reason === 'new').length
    const updatedCount = capped.filter((u) => u.reason === 'updated').length

    console.log(
      `[scrape-blog] Project ${blog_project_id}: ${entries.length} sitemap entries, ` +
        `${(existingArticles || []).length} existing, ${newCount} new, ${updatedCount} updated`,
    )

    // 5. Invoke scrape-single in batches
    const projectUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const errors: string[] = []
    let dispatched = 0

    for (let i = 0; i < capped.length; i += BATCH_SIZE) {
      const batch = capped.slice(i, i + BATCH_SIZE)

      const results = await Promise.allSettled(
        batch.map((item) =>
          fetch(`${projectUrl}/functions/v1/scrape-single`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              blog_project_id,
              url: item.url,
              tenant_id,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const text = await res.text()
              throw new Error(`${item.url}: ${res.status} ${text}`)
            }
            return res.json()
          }),
        ),
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          dispatched++
        } else {
          errors.push(result.reason?.message || 'Unknown error')
          console.error('[scrape-blog] Error:', result.reason)
        }
      }
    }

    // 6. Update last_scraped_at
    await supabase
      .from('blog_projects')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', blog_project_id)

    return new Response(
      JSON.stringify({
        success: true,
        dispatched,
        new_count: newCount,
        updated_count: updatedCount,
        total_sitemap_entries: entries.length,
        existing_articles: (existingArticles || []).length,
        errors,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[scrape-blog] Error:', message)

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
