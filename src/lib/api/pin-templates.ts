import { supabase } from '@/lib/supabase'
import { getSupabaseClient } from '@/lib/supabase-iso'
import { ensureProfile } from '@/lib/auth'
import { workspaceForStatus } from '@/lib/pin-template-workspace'
import type {
  PinTemplate,
  PinTemplateRevision,
  PinTemplateStatus,
} from '@/types/pin-templates'

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
 * Count of *open* (still-to-review: `draft` + `needs_revision`) templates per
 * article for a project, keyed by article id. Powers the left-column badge that
 * shows how much review work each article still has. `pin_templates` has no
 * `blog_project_id`, so the project scope is applied through an inner join on
 * `blog_articles`; the open/closed split is done client-side over a lightweight
 * `blog_article_id, status` read (mirroring `getPinStatusCounts`). Articles with
 * no open templates are omitted (count 0). Runs through the isomorphic client so
 * it respects tenant RLS under SSR-auth (ADR 0003).
 */
export async function getOpenPinTemplateCountsByProject(
  projectId: string
): Promise<Record<string, number>> {
  const { data, error } = await getSupabaseClient()
    .from('pin_templates')
    .select('blog_article_id, status, blog_articles!inner(blog_project_id)')
    .eq('blog_articles.blog_project_id', projectId)

  if (error) throw error

  const counts: Record<string, number> = {}
  for (const row of data as { blog_article_id: string; status: PinTemplateStatus }[]) {
    if (workspaceForStatus(row.status) !== 'open') continue
    counts[row.blog_article_id] = (counts[row.blog_article_id] ?? 0) + 1
  }
  return counts
}

/**
 * The last 3 revision requests for a template, newest first — the change history
 * shown in the detail view. Runs through the isomorphic client so it respects
 * tenant RLS under the SSR-auth read pattern (ADR 0003). The application layer
 * keeps only the last 3 rows per template, so the `.limit(3)` also matches the
 * retention window (issue #79).
 */
export async function getPinTemplateRevisions(
  templateId: string
): Promise<PinTemplateRevision[]> {
  const { data, error } = await getSupabaseClient()
    .from('pin_template_revisions')
    .select('*')
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) throw error
  return data ?? []
}

/**
 * Request a revision on a template: record the reviewer's `feedback` and move the
 * template to `needs_revision` so the external agent picks it up (it reworks the
 * template and sets the status back to `draft`). Both steps go through the browser
 * `supabase` client under tenant RLS. Only the last 3 revisions per template are
 * kept — older rows are pruned in the application layer (mirrors the
 * `pin_metadata_generations` history pattern). Returns the updated template.
 */
export async function requestPinTemplateRevision(
  templateId: string,
  feedback: string
): Promise<PinTemplate> {
  const { tenant_id } = await ensureProfile()

  // 1. Record the revision request.
  const { error: insertError } = await supabase
    .from('pin_template_revisions')
    .insert({ template_id: templateId, tenant_id, feedback: feedback.trim() })

  if (insertError) throw insertError

  // 2. Move the template to needs_revision so the agent picks it up.
  const { data, error: updateError } = await supabase
    .from('pin_templates')
    .update({ status: 'needs_revision' })
    .eq('id', templateId)
    .select()
    .single()

  if (updateError) throw updateError

  // 3. Keep only the last 3 revisions per template (application-layer retention).
  const { data: revisions } = await supabase
    .from('pin_template_revisions')
    .select('id')
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })

  if (revisions && revisions.length > 3) {
    const idsToKeep = revisions.slice(0, 3).map((r) => r.id)
    await supabase
      .from('pin_template_revisions')
      .delete()
      .eq('template_id', templateId)
      .not('id', 'in', `(${idsToKeep.join(',')})`)
  }

  return data
}

/**
 * Change a single template's review status (Freigeben → `approved`, Archivieren
 * → `archived`, zurück nach Offen → `draft`). Goes through the browser `supabase`
 * client under tenant RLS. Template *texts* are never edited in the UI — only
 * the status moves (issue #78, epic #74).
 */
export async function updatePinTemplateStatus(
  id: string,
  status: PinTemplateStatus
): Promise<PinTemplate> {
  const { data, error } = await supabase
    .from('pin_templates')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}
