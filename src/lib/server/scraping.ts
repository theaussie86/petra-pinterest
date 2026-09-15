import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from './supabase'
import { normalizeUrl } from '@/lib/utils'
import type { ScrapeResponse } from '@/types/articles'

/**
 * Server function: trigger a full blog scrape.
 * A tenant-checked RPC enqueues one scrape_blog message; the worker discovers
 * the sitemap and fans out into scrape_article within ~15s (ADR-0004, issue
 * #91). The UI only shows a "started" toast.
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

    // The RPC checks the caller's tenant owns the project and enqueues one
    // scrape_blog message; the queue worker picks it up within ~15s.
    const { error: enqueueError } = await supabase.rpc('enqueue_scrape_blog', {
      p_blog_project_id: data.blog_project_id,
    })
    if (enqueueError) throw new Error(enqueueError.message)

    return { success: true, dispatched: 1 }
  })

/**
 * Server function: scrape a single article URL (fire-and-forget).
 * A tenant-checked RPC enqueues one scrape_article message; the worker picks it
 * up within ~15s (ADR-0004, issue #90).
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

    const { error: enqueueError } = await supabase.rpc('enqueue_scrape_article', {
      p_blog_project_id: data.blog_project_id,
      p_url: normalizeUrl(data.url),
    })
    if (enqueueError) throw new Error(enqueueError.message)

    return {
      success: true,
      articles_found: 1,
      articles_created: 0,
      articles_updated: 0,
      method: 'single',
      errors: [],
    }
  })
