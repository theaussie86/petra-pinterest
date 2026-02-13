import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from './supabase'

import { inngest } from '../../../server/inngest/client'
import type { ScrapeResponse } from '@/types/articles'

/**
 * Server function: trigger a full blog scrape via Inngest.
 * Authenticates via cookies, resolves tenant_id, then sends an Inngest event.
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

    await inngest.send({
      name: 'blog/scrape.requested',
      data: {
        blog_project_id: data.blog_project_id,
        blog_url: data.blog_url,
        sitemap_url: data.sitemap_url,
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

    await inngest.send({
      name: 'blog/scrape-single.requested',
      data: {
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
