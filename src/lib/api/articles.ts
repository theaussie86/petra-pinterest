import { supabase } from '@/lib/supabase'
import type { Article, ScrapeRequest, ScrapeResponse } from '@/types/articles'

export async function getArticlesByProject(projectId: string): Promise<Article[]> {
  const { data, error } = await supabase
    .from('blog_articles')
    .select('*')
    .eq('blog_project_id', projectId)
    .is('archived_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return data
}

export async function getArticle(id: string): Promise<Article> {
  const { data, error } = await supabase
    .from('blog_articles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function archiveArticle(id: string): Promise<Article> {
  const { data, error } = await supabase
    .from('blog_articles')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function restoreArticle(id: string): Promise<Article> {
  const { data, error } = await supabase
    .from('blog_articles')
    .update({ archived_at: null })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getArchivedArticles(projectId: string): Promise<Article[]> {
  const { data, error } = await supabase
    .from('blog_articles')
    .select('*')
    .eq('blog_project_id', projectId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  if (error) throw error
  return data
}

export async function scrapeBlog(request: ScrapeRequest): Promise<ScrapeResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Not authenticated')
  }

  const response = await fetch('/api/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(request),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.errors?.[0] || 'Failed to scrape blog')
  }

  return data as ScrapeResponse
}

export async function addArticleManually(projectId: string, url: string): Promise<ScrapeResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Not authenticated')
  }

  const response = await fetch('/api/scrape/single', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      blog_project_id: projectId,
      url,
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.errors?.[0] || 'Failed to add article')
  }

  return data as ScrapeResponse
}
