import { getSupabaseClient } from '@/lib/supabase-iso'
import type { PinTemplate } from '@/types/pin-templates'

/**
 * All templates for a single article, ordered by position ascending (1..N).
 * Runs through the isomorphic client so it respects tenant RLS under the
 * SSR-auth read pattern (ADR 0003).
 */
export async function getPinTemplatesByArticle(articleId: string): Promise<PinTemplate[]> {
  const { data, error } = await getSupabaseClient()
    .from('pin_templates')
    .select('*')
    .eq('blog_article_id', articleId)
    .order('position', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Template counts per article for a project, keyed by article id. `pin_templates`
 * has no `blog_project_id`, so the project scope is applied through an inner join
 * on `blog_articles`. A lightweight `blog_article_id`-only read aggregated
 * client-side, mirroring `getPinStatusCounts`. Runs through the isomorphic client
 * so it respects tenant RLS under SSR-auth (ADR 0003).
 */
export async function getPinTemplateCountsByProject(
  projectId: string
): Promise<Record<string, number>> {
  const { data, error } = await getSupabaseClient()
    .from('pin_templates')
    .select('blog_article_id, blog_articles!inner(blog_project_id)')
    .eq('blog_articles.blog_project_id', projectId)

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of data as { blog_article_id: string }[]) {
    counts[row.blog_article_id] = (counts[row.blog_article_id] ?? 0) + 1
  }
  return counts
}
