import { supabase } from '@/lib/supabase'
import { scrapeBlogFn, scrapeSingleFn } from '@/lib/server/scraping'
import type { Article, ScrapeRequest, ScrapeResponse } from '@/types/articles'

export interface PaginatedArticlesResult {
  articles: Article[]
  nextCursor: string | null
}

export interface GetArticlesPaginatedOptions {
  cursor?: string
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

// Paginated fetch for active articles
export async function getArticlesPaginated(
  projectId: string,
  options: GetArticlesPaginatedOptions = {}
): Promise<PaginatedArticlesResult> {
  const { cursor, limit = 20 } = options

  let query = supabase
    .from('blog_articles')
    .select('*')
    .eq('blog_project_id', projectId)
    .is('archived_at', null)

  if (cursor) {
    query = query.lt('published_at', cursor)
  }

  const { data, error } = await query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (error) throw error

  const hasMore = data.length > limit
  const articles = hasMore ? data.slice(0, limit) : data
  const nextCursor = hasMore ? articles[articles.length - 1].published_at : null

  return { articles, nextCursor }
}

// Paginated fetch for archived articles
export async function getArchivedArticlesPaginated(
  projectId: string,
  options: GetArticlesPaginatedOptions = {}
): Promise<PaginatedArticlesResult> {
  const { cursor, limit = 20 } = options

  let query = supabase
    .from('blog_articles')
    .select('*')
    .eq('blog_project_id', projectId)
    .not('archived_at', 'is', null)

  if (cursor) {
    query = query.lt('archived_at', cursor)
  }

  const { data, error } = await query
    .order('archived_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (error) throw error

  const hasMore = data.length > limit
  const articles = hasMore ? data.slice(0, limit) : data
  const nextCursor = hasMore ? articles[articles.length - 1].archived_at : null

  return { articles, nextCursor }
}
