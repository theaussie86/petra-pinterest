import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getSupabaseClient } from '@/lib/supabase-iso'
import { scrapeBlogFn, scrapeSingleFn } from '@/lib/server/scraping'
import type {
  Article,
  ArticleWorkshopStatus,
  ScrapeRequest,
  ScrapeResponse,
} from '@/types/articles'

export interface PaginatedArticlesResult {
  articles: Article[]
  hasMore: boolean
}

export interface GetArticlesPaginatedOptions {
  offset?: number
  limit?: number
}

export async function getAllArticles(): Promise<Article[]> {
  const { data, error } = await getSupabaseClient()
    .from('blog_articles')
    .select('*')
    .is('archived_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return data
}

export async function getArticlesByProject(projectId: string): Promise<Article[]> {
  const { data, error } = await getSupabaseClient()
    .from('blog_articles')
    .select('*')
    .eq('blog_project_id', projectId)
    .is('archived_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return data
}

export async function getArticle(
  id: string,
  client: SupabaseClient = getSupabaseClient(),
): Promise<Article> {
  const { data, error } = await client
    .from('blog_articles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export interface ListArticlesOptions {
  /** Restrict to one project. Omit for every project the caller can see. */
  projectId?: string
  /** `false`/omitted (default) active only; `true` archived only. */
  archived?: boolean
  /** Case-insensitive substring match on the title. */
  search?: string
  offset?: number
  limit?: number
}

/**
 * Filtered, paginated article list shared by the UI and the MCP server
 * (Spec #115, user story 20). Filters by project, archive state and a title
 * search; pages offset-based. Takes an optional Supabase client so a Connected
 * Agent's token-bound client runs the same query under RLS (ADR-0006).
 */
export async function listArticles(
  options: ListArticlesOptions = {},
  client: SupabaseClient = getSupabaseClient(),
): Promise<PaginatedArticlesResult> {
  const { projectId, archived = false, search, offset = 0, limit = 20 } = options
  const title = search?.trim()

  let query = client.from('blog_articles').select('*')

  if (projectId) query = query.eq('blog_project_id', projectId)
  if (archived) query = query.not('archived_at', 'is', null)
  else query = query.is('archived_at', null)
  if (title) query = query.ilike('title', `%${title}%`)

  // Fetch limit + 1 to tell whether a further page follows.
  const { data, error } = await query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit)

  if (error) throw error

  const rows = (data as Article[] | null) ?? []
  const hasMore = rows.length > limit
  const articles = hasMore ? rows.slice(0, limit) : rows

  return { articles, hasMore }
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

/**
 * Curate an article for the Pin-Werkstatt: `wanted` queues it for the template
 * agent (with an optional note), `excluded` keeps it out, `null` resets it to
 * undecided. The note is only kept for `wanted`. Goes through the browser
 * client under tenant RLS.
 */
export async function updateArticleWorkshopStatus(
  id: string,
  status: ArticleWorkshopStatus | null,
  note?: string | null
): Promise<Article> {
  const trimmed = note?.trim() || null
  const { data, error } = await supabase
    .from('blog_articles')
    .update({
      workshop_status: status,
      workshop_note: status === 'wanted' ? trimmed : null,
      workshop_status_changed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getArchivedArticles(projectId: string): Promise<Article[]> {
  const { data, error } = await getSupabaseClient()
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
  const { data, error } = await getSupabaseClient()
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
  const { data, error } = await getSupabaseClient()
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
