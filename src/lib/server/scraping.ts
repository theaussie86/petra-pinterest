import { createServerFn } from '@tanstack/react-start'
import { tasks } from '@trigger.dev/sdk/v3'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import { discoverSitemapUrls } from '../../../server/lib/scraping'
import type { ScrapeResponse } from '@/types/articles'
import { isTriggerDevEnabled } from '@/lib/config/feature-flags'
import type { scrapeBlogTask } from '@/trigger/scrape-blog'
import type { scrapeSingleTask } from '@/trigger/scrape-single'

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
 * Uses Trigger.dev or Edge Functions depending on feature flag.
 * Discovers sitemap URLs, diffs against existing articles, then dispatches jobs.
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

    if (isTriggerDevEnabled('scraping')) {
      // Use Trigger.dev - let the task handle sitemap discovery and batching
      const handle = await tasks.trigger<typeof scrapeBlogTask>('scrape-blog', {
        blog_project_id: data.blog_project_id,
        blog_url: data.blog_url,
        sitemap_url: data.sitemap_url,
        tenant_id: profile.tenant_id,
      })
      return {
        success: true,
        dispatched: 1,
        runId: handle.id,
        useTrigger: true,
      }
    }

    // Fallback: Use Edge Functions
    const discoveredUrls = await discoverSitemapUrls(
      data.blog_url,
      data.sitemap_url ?? undefined,
    )

    const { data: existingArticles } = await supabase
      .from('blog_articles')
      .select('url')
      .eq('blog_project_id', data.blog_project_id)

    const existingUrls = new Set(
      (existingArticles ?? []).map((a: { url: string }) => a.url),
    )
    const newUrls = discoveredUrls.filter((url) => !existingUrls.has(url))

    if (newUrls.length === 0) {
      return { success: true, dispatched: 0, useTrigger: false }
    }

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

    return { success: true, dispatched: newUrls.length, useTrigger: false }
  })

/**
 * Server function: scrape a single article URL (fire-and-forget).
 * Uses Trigger.dev or Edge Functions depending on feature flag.
 */
export const scrapeSingleFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { blog_project_id: string; url: string }) => data,
  )
  .handler(async ({ data }): Promise<ScrapeResponse & { runId?: string; useTrigger?: boolean }> => {
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

    if (isTriggerDevEnabled('scraping')) {
      // Use Trigger.dev
      const handle = await tasks.trigger<typeof scrapeSingleTask>('scrape-single', {
        blog_project_id: data.blog_project_id,
        url: data.url,
        tenant_id: profile.tenant_id,
      })
      return {
        success: true,
        articles_found: 1,
        articles_created: 0,
        articles_updated: 0,
        method: 'single',
        errors: [],
        runId: handle.id,
        useTrigger: true,
      }
    }

    // Fallback: Fire-and-forget edge function
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
      useTrigger: false,
    }
  })
