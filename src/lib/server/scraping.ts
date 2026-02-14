import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import { discoverSitemapUrls } from '../../../server/lib/scraping'
import type { ScrapeResponse } from '@/types/articles'

async function batchInvoke<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  concurrency = 5,
): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

/**
 * Server function: trigger a full blog scrape.
 * Discovers sitemap URLs, diffs against existing articles, then
 * invokes the scrape-single edge function for each new URL.
 */
export const scrapeBlogFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { blog_project_id: string; blog_url: string; sitemap_url?: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Discover URLs via sitemap
    const discoveredUrls = await discoverSitemapUrls(
      data.blog_url,
      data.sitemap_url ?? undefined,
    )

    // Diff against existing articles
    const { data: existingArticles } = await supabase
      .from('blog_articles')
      .select('url')
      .eq('blog_project_id', data.blog_project_id)

    const existingUrls = new Set(
      (existingArticles ?? []).map((a: { url: string }) => a.url),
    )
    const newUrls = discoveredUrls.filter((url) => !existingUrls.has(url))

    if (newUrls.length === 0) {
      return { success: true, dispatched: 0 }
    }

    // Fan out: invoke scrape-single edge function for each new URL
    const serviceClient = getSupabaseServiceClient()
    await batchInvoke(newUrls, (url) =>
      serviceClient.functions.invoke('scrape-single', {
        body: {
          blog_project_id: data.blog_project_id,
          url,
          tenant_id: profile.tenant_id,
        },
      }),
    )

    return { success: true, dispatched: newUrls.length }
  })

/**
 * Server function: scrape a single article URL (fire-and-forget).
 * Authenticates via cookies, invokes the scrape-single edge function.
 */
export const scrapeSingleFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { blog_project_id: string; url: string }) => data,
  )
  .handler(async ({ data }): Promise<ScrapeResponse> => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Fire-and-forget: invoke edge function, don't await result
    const serviceClient = getSupabaseServiceClient()
    serviceClient.functions.invoke('scrape-single', {
      body: {
        blog_project_id: data.blog_project_id,
        url: data.url,
        tenant_id: profile.tenant_id,
      },
    })

    return {
      success: true,
      articles_found: 1,
      articles_created: 0,
      articles_updated: 0,
      method: 'single',
      errors: [],
    }
  })
