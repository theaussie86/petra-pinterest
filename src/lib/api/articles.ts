import { supabase } from '@/lib/supabase'
import { scrapeBlogFn, scrapeSingleFn } from '@/lib/server/scraping'
import type { Article, ScrapeRequest, ScrapeResponse } from '@/types/articles'

export interface PaginatedArticlesResult {
  articles: Article[]
  hasMore: boolean
}

export interface GetArticlesPaginatedOptions {
  offset?: number
  limit?: number
}

export async function getAllArticles(): Promise<Article[]> {
  const { data, error } = await supabase
    .from('blog_articles')
    .select('*')
    .is('archived_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return data
}

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

export async function scrapeBlog(request: ScrapeRequest) {
  return await scrapeBlogFn({ data: request })
}

export async function updateArticleContent(id: string, content: string): Promise<Article> {
  const { data, error } = await supabase
    .from('blog_articles')
    .update({ content })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addArticleManually(projectId: string, url: string): Promise<ScrapeResponse> {
  return await scrapeSingleFn({ data: { blog_project_id: projectId, url } })
}

// Hard delete single article
export async function deleteArticle(id: string): Promise<void> {
  const { error } = await supabase
    .from('blog_articles')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Hard delete multiple articles
export async function deleteArticles(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('blog_articles')
    .delete()
    .in('id', ids)

  if (error) throw error
}

// Bulk archive articles
export async function archiveArticles(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('blog_articles')
    .update({ archived_at: new Date().toISOString() })
    .in('id', ids)

  if (error) throw error
}

// Bulk restore articles
export async function restoreArticles(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('blog_articles')
    .update({ archived_at: null })
    .in('id', ids)

  if (error) throw error
}

// Paginated fetch for active articles (offset-based)
export async function getArticlesPaginated(
  projectId: string,
  options: GetArticlesPaginatedOptions = {}
): Promise<PaginatedArticlesResult> {
  const { offset = 0, limit = 20 } = options

  // Fetch limit + 1 to check if there are more items
  const { data, error } = await supabase
    .from('blog_articles')
    .select('*')
    .eq('blog_project_id', projectId)
    .is('archived_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit)

  if (error) throw error

  const hasMore = data.length > limit
  const articles = hasMore ? data.slice(0, limit) : data

  return { articles, hasMore }
}

// Paginated fetch for archived articles (offset-based)
export async function getArchivedArticlesPaginated(
  projectId: string,
  options: GetArticlesPaginatedOptions = {}
): Promise<PaginatedArticlesResult> {
  const { offset = 0, limit = 20 } = options

  // Fetch limit + 1 to check if there are more items
  const { data, error } = await supabase
    .from('blog_articles')
    .select('*')
    .eq('blog_project_id', projectId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit)

  if (error) throw error

  const hasMore = data.length > limit
  const articles = hasMore ? data.slice(0, limit) : data

  return { articles, hasMore }
}
