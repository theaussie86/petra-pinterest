import { createServerFn } from '@tanstack/react-start'
import { tasks } from '@trigger.dev/sdk/v3'
import { getSupabaseServerClient } from './supabase'
import { normalizeUrl } from '@/lib/utils'
import type { ScrapeResponse } from '@/types/articles'
import { isTriggerDevEnabled } from '@/lib/config/feature-flags'
import type { scrapeBlogTask } from '@/trigger/scrape-blog'
import type { scrapeSingleTask } from '@/trigger/scrape-single'

/**
 * Server function: trigger a full blog scrape.
 * Uses Trigger.dev or the scrape_blog queue depending on the feature flag.
 * With the flag off, a tenant-checked RPC enqueues one scrape_blog message; the
 * worker discovers the sitemap and fans out into scrape_article within ~15s
 * (ADR-0004, issue #91). The UI only shows a "started" toast.
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

    if (!isTriggerDevEnabled('scraping')) {
      // The RPC checks the caller's tenant owns the project and enqueues one
      // scrape_blog message; the queue worker picks it up within ~15s.
      const { error: enqueueError } = await supabase.rpc('enqueue_scrape_blog', {
        p_blog_project_id: data.blog_project_id,
      })
      if (enqueueError) throw new Error(enqueueError.message)

      return { success: true, dispatched: 1, useTrigger: false }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

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

    if (!isTriggerDevEnabled('scraping')) {
      // The RPC checks the caller's tenant owns the project and enqueues one
      // scrape_article message; the queue worker picks it up within ~15s
      // (ADR-0004, issue #90).
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
        useTrigger: false,
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Use Trigger.dev
    const handle = await tasks.trigger<typeof scrapeSingleTask>('scrape-single', {
      blog_project_id: data.blog_project_id,
      url: normalizeUrl(data.url),
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
  })
