import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getSupabaseClient } from '@/lib/supabase-iso'
import { ensureProfile } from '@/lib/auth'
import { workspaceForStatus, type WorkspaceCounts } from '@/lib/pin-template-workspace'
import type {
  PinTemplate,
  PinTemplateDesign,
  PinTemplateRevision,
  PinTemplateStatus,
} from '@/types/pin-templates'

/**
 * All templates for a single article, ordered by position ascending (1..N).
 * Takes an optional Supabase client so the UI and the MCP server share the
 * query: the UI omits it (isomorphic client under SSR-auth, ADR 0003), a
 * Connected Agent passes its token-bound client so the read runs under RLS.
 */
export async function getPinTemplatesByArticle(
  articleId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<PinTemplate[]> {
  const { data, error } = await client
    .from('pin_templates')
    .select('*')
    .eq('blog_article_id', articleId)
    .order('position', { ascending: true })

  if (error) throw error
  return data
}

/**
 * A single pin template by id. Takes an optional Supabase client so the MCP
 * `get_pin_template` tool runs the read under the Connected Agent's RLS session
 * (defaults to the isomorphic client for UI reads, ADR 0003).
 */
export async function getPinTemplate(
  id: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<PinTemplate> {
  const { data, error } = await client
    .from('pin_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Per-article template counts per review workspace (Offen / Freigegeben /
 * Archiv) for a project, keyed by article id. Powers the left-column progress
 * (approved of total) and the open-work badge. `pin_templates` has no
 * `blog_project_id`, so the project scope is applied through an inner join on
 * `blog_articles`; the workspace split is done client-side over a lightweight
 * `blog_article_id, status` read (mirroring `getPinStatusCounts`). Articles
 * without templates are omitted. Runs through the isomorphic client so it
 * respects tenant RLS under SSR-auth (ADR 0003).
 */
export async function getPinTemplateCountsByProject(
  projectId: string
): Promise<Record<string, WorkspaceCounts>> {
  const { data, error } = await getSupabaseClient()
    .from('pin_templates')
    .select('blog_article_id, status, blog_articles!inner(blog_project_id)')
    .eq('blog_articles.blog_project_id', projectId)

  if (error) throw error

  const counts: Record<string, WorkspaceCounts> = {}
  for (const row of data as { blog_article_id: string; status: PinTemplateStatus }[]) {
    const entry = (counts[row.blog_article_id] ??= { open: 0, approved: 0, archived: 0 })
    entry[workspaceForStatus(row.status)] += 1
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
  templateId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<PinTemplateRevision[]> {
  const { data, error } = await client
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

/** Provenance stamped on every template a Connected Agent writes (ADR-0006). */
export interface PinTemplateProvenance {
  source: 'mcp'
  oauth_client_id: string | null
}

/** The content fields a Connected Agent may set on a template (never status). */
export interface PinTemplateContent {
  position: number
  main_keyword: string
  image_prompt: string
  pin_type?: string | null
  title?: string | null
  description?: string | null
  board_name_raw?: string | null
  overlay?: string | null
  longtails?: string[] | null
  search_phrases?: string[] | null
  quality_check?: string[] | null
  search_intent?: string | null
  image_idea?: string | null
  design?: PinTemplateDesign | null
  season?: string | null
}

/** Fields a Connected Agent may set when creating a template via MCP. */
export interface AgentPinTemplateInsert extends PinTemplateContent, PinTemplateProvenance {
  tenant_id: string
  blog_article_id: string
}

/**
 * Insert a pin template on behalf of a Connected Agent (MCP). Takes an explicit
 * client and provenance; the DB CHECK constraints (migration 00027) are the
 * enforcing authority, so a bad row surfaces as a thrown error the tool turns
 * into a readable message. The agent can only ever write `draft` (ADR-0006).
 */
export async function insertAgentPinTemplate(
  template: AgentPinTemplateInsert,
  client: SupabaseClient
): Promise<PinTemplate> {
  const { data, error } = await client
    .from('pin_templates')
    .insert({ ...template, status: 'draft' })
    .select()
    .single()
  if (error) throw error
  return data
}

/** A partial content patch plus provenance for a template update via MCP. */
export type AgentPinTemplateUpdate = Partial<PinTemplateContent> & PinTemplateProvenance

/**
 * Update a template's content on behalf of a Connected Agent (MCP). Never
 * touches the status — approving/archiving stays a human action in the UI
 * (ADR-0006). The caller enforces the draft/needs_revision guardrail.
 */
export async function updateAgentPinTemplate(
  id: string,
  patch: AgentPinTemplateUpdate,
  client: SupabaseClient
): Promise<PinTemplate> {
  const { data, error } = await client
    .from('pin_templates')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Answer a revision request on behalf of a Connected Agent (MCP). Records the
 * template's pre-rework fields on the newest revision row (`previous_snapshot`),
 * applies the reworked content and moves the template back to `draft` so the
 * reviewer sees the result (migration 00028; ADR-0006). Provenance is stamped.
 */
export async function answerAgentRevisionRequest(
  templateId: string,
  patch: AgentPinTemplateUpdate,
  previousSnapshot: Record<string, unknown>,
  client: SupabaseClient
): Promise<PinTemplate> {
  const { data: latest } = await client
    .from('pin_template_revisions')
    .select('id')
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })
    .limit(1)

  const latestId = (latest as { id: string }[] | null)?.[0]?.id
  if (latestId) {
    await client
      .from('pin_template_revisions')
      .update({ previous_snapshot: previousSnapshot })
      .eq('id', latestId)
  }

  const { data, error } = await client
    .from('pin_templates')
    .update({ ...patch, status: 'draft' })
    .eq('id', templateId)
    .select()
    .single()
  if (error) throw error
  return data
}
