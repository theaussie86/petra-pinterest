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
  const { data, error } = await supabase.functions.invoke('scrape-blog', {
    body: request
  })

  if (error) {
    throw new Error(`Failed to scrape blog: ${error.message}`)
  }

  return data as ScrapeResponse
}

export async function addArticleManually(projectId: string, url: string): Promise<ScrapeResponse> {
  const { data, error } = await supabase.functions.invoke('scrape-blog', {
    body: {
      blog_project_id: projectId,
      single_url: url
    }
  })

  if (error) {
    throw new Error(`Failed to add article: ${error.message}`)
  }

  return data as ScrapeResponse
}
