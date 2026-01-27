import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/auth'
import type { BlogProject, BlogProjectInsert, BlogProjectUpdate } from '@/types/blog-projects'

export async function getBlogProjects(): Promise<BlogProject[]> {
  const { data, error } = await supabase
    .from('blog_projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getBlogProject(id: string): Promise<BlogProject> {
  const { data, error } = await supabase
    .from('blog_projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createBlogProject(project: BlogProjectInsert): Promise<BlogProject> {
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user) throw new Error('Not authenticated')

  // Ensure profile exists and get tenant_id (handles missing profile from pre-migration signups)
  const { tenant_id } = await ensureProfile()

  // Insert project with tenant_id
  const { data, error } = await supabase
    .from('blog_projects')
    .insert({
      ...project,
      tenant_id
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateBlogProject({ id, ...updates }: BlogProjectUpdate): Promise<BlogProject> {
  const { data, error } = await supabase
    .from('blog_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteBlogProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('blog_projects')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function checkProjectRelatedData(id: string): Promise<{ articles: number; pins: number }> {
  try {
    // Query blog_articles count
    const { count: articlesCount, error: articlesError } = await supabase
      .from('blog_articles')
      .select('*', { count: 'exact', head: true })
      .eq('blog_project_id', id)

    // Query pins count
    const { count: pinsCount, error: pinsError } = await supabase
      .from('pins')
      .select('*', { count: 'exact', head: true })
      .eq('blog_project_id', id)

    // Graceful degradation if tables don't exist yet
    return {
      articles: articlesError ? 0 : (articlesCount ?? 0),
      pins: pinsError ? 0 : (pinsCount ?? 0)
    }
  } catch (error) {
    // Tables don't exist yet (Phase 2), return zeros
    return { articles: 0, pins: 0 }
  }
}
