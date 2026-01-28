import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient, getSupabaseServiceClient } from './supabase'
import { scrapeSingleUrl } from '../../../server/lib/scraping'
import { inngest } from '../../../server/inngest/client'
import type { ScrapeResponse } from '@/types/articles'

/**
 * Server function: trigger a full blog scrape via Inngest.
 * Authenticates via cookies, resolves tenant_id, then sends an Inngest event.
 */
export const scrapeBlogFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { blog_project_id: string; blog_url: string; rss_url?: string | null }) => data,
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

    await inngest.send({
      name: 'blog/scrape.requested',
      data: {
        blog_project_id: data.blog_project_id,
        blog_url: data.blog_url,
        rss_url: data.rss_url,
        tenant_id: profile.tenant_id,
      },
    })

    return { success: true }
  })

/**
 * Server function: scrape a single article URL synchronously.
 * Authenticates via cookies, scrapes the URL, upserts to DB via service client.
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

    const article = await scrapeSingleUrl(data.url)

    const serviceClient = getSupabaseServiceClient()
    const { error: upsertError } = await serviceClient
      .from('blog_articles')
      .upsert(
        {
          tenant_id: profile.tenant_id,
          blog_project_id: data.blog_project_id,
          title: article.title,
          url: article.url,
          content: article.content,
          published_at: article.published_at,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'blog_project_id,url' },
      )

    if (upsertError) {
      return {
        success: false,
        articles_found: 1,
        articles_created: 0,
        articles_updated: 0,
        method: 'single',
        errors: [upsertError.message],
      }
    }

    return {
      success: true,
      articles_found: 1,
      articles_created: 1,
      articles_updated: 0,
      method: 'single',
      errors: [],
    }
  })
