import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { scrapeAndStoreArticle, type ScrapeArticleJob } from '../_shared/scrape-article.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { blog_project_id, url, tenant_id } = (await req.json()) as ScrapeArticleJob

    if (!blog_project_id || !url || !tenant_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'blog_project_id, url, and tenant_id are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabase = createServiceClient()
    await scrapeAndStoreArticle(supabase, { blog_project_id, url, tenant_id })

    return new Response(
      JSON.stringify({
        success: true,
        articles_found: 1,
        articles_created: 1,
        articles_updated: 0,
        method: 'gemini-fetch',
        errors: [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[scrape-single] Error:', message)

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
