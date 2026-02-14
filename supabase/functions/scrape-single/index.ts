import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { generateArticleFromHtml } from '../_shared/gemini.ts'

interface ScrapeRequest {
  blog_project_id: string
  url: string
  tenant_id: string
}

/**
 * Clean HTML by stripping non-content tags via regex.
 * DOMParser is not available in the Supabase Edge Function runtime.
 */
function cleanHtml(html: string): string {
  // Remove entire tag blocks (opening + content + closing)
  const tagsToRemove = [
    'script',
    'style',
    'svg',
    'noscript',
    'nav',
    'footer',
    'header',
  ]
  let cleaned = html
  for (const tag of tagsToRemove) {
    cleaned = cleaned.replace(
      new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'),
      ''
    )
  }
  // Remove self-closing tags: <link>, <meta>
  cleaned = cleaned.replace(/<(link|meta)[^>]*\/?>/gi, '')
  // Extract body content if present
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return bodyMatch ? bodyMatch[1] : cleaned
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { blog_project_id, url, tenant_id } =
      (await req.json()) as ScrapeRequest

    if (!blog_project_id || !url || !tenant_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'blog_project_id, url, and tenant_id are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabase = createServiceClient()

    // Get Gemini API key from Vault
    const { data: apiKey, error: vaultError } = await supabase.rpc(
      'get_gemini_api_key',
      { p_blog_project_id: blog_project_id }
    )

    if (vaultError || !apiKey) {
      throw new Error(
        `Failed to retrieve Gemini API key: ${vaultError?.message || 'No key configured'}`
      )
    }

    // Fetch and clean HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; PetraPinterestBot/1.0; +http://localhost:3000)',
      },
    })

    if (!response.ok) {
      throw new Error(
        `Failed to fetch URL: ${response.status} ${response.statusText}`
      )
    }

    const html = await response.text()
    const cleanedHtml = cleanHtml(html)

    // Extract article with Gemini
    const article = await generateArticleFromHtml(cleanedHtml, url, apiKey)

    // Upsert into blog_articles
    // Gemini may return "null" as a string when no date is found
    const publishedAt =
      article.published_at && article.published_at !== 'null'
        ? article.published_at
        : null

    const { error: upsertError } = await supabase
      .from('blog_articles')
      .upsert(
        {
          tenant_id,
          blog_project_id,
          title: article.title,
          url,
          content: article.content,
          published_at: publishedAt,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'blog_project_id,url' }
      )

    if (upsertError) {
      throw new Error(upsertError.message)
    }

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
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[scrape-single] Error:', message)

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
