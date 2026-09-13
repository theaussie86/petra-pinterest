-- Pin-Werkstatt Agent Role (least-privilege DB user for the external agent)
-- A dedicated Postgres role the external Pin-Werkstatt agent logs in with,
-- instead of the service role key. The role does NOT bypass RLS: it only sees
-- and writes data for the blog projects explicitly granted to it in
-- public.agent_project_access.
-- Created: 2026-09-13 (epic #74)
--
-- Login is NOT enabled here, so no password lands in git. Enable it once, by
-- hand, in the Supabase SQL editor:
--
--   ALTER ROLE pin_werkstatt_agent WITH LOGIN PASSWORD '<strong-password>';
--
-- Grant a project:
--
--   INSERT INTO public.agent_project_access (role_name, blog_project_id)
--   VALUES ('pin_werkstatt_agent', '<blog_project_id>');
--
-- Extending access later = GRANT on the table + a policy TO pin_werkstatt_agent
-- scoped via agent_project_access. Never GRANT EXECUTE on SECURITY DEFINER
-- functions to this role: they bypass RLS and therefore the project scope.

-- ============================================================================
-- ROLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pin_werkstatt_agent') THEN
    CREATE ROLE pin_werkstatt_agent NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE pin_werkstatt_agent SET statement_timeout = '30s';

COMMENT ON ROLE pin_werkstatt_agent IS
  'External Pin-Werkstatt agent. Reads articles and writes pin templates only for projects listed in public.agent_project_access. Does not bypass RLS.';

-- ============================================================================
-- PROJECT ACCESS TABLE
-- ============================================================================
-- One row per (agent role, blog project). Managed by an admin via SQL; not
-- visible to app users or the anon role.

CREATE TABLE IF NOT EXISTS public.agent_project_access (
  role_name TEXT NOT NULL,
  blog_project_id UUID NOT NULL REFERENCES public.blog_projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_name, blog_project_id)
);

COMMENT ON TABLE public.agent_project_access IS
  'Which agent role may work on which blog project. A role only sees rows for itself (role_name = current_user).';

ALTER TABLE public.agent_project_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_project_access FROM anon, authenticated;

DROP POLICY IF EXISTS "Agent sees own project grants" ON public.agent_project_access;
CREATE POLICY "Agent sees own project grants"
  ON public.agent_project_access
  FOR SELECT
  TO pin_werkstatt_agent
  USING (role_name = current_user);

DROP POLICY IF EXISTS "Service role full access agent_project_access" ON public.agent_project_access;
CREATE POLICY "Service role full access agent_project_access"
  ON public.agent_project_access
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE PRIVILEGES
-- ============================================================================
-- Read-only on projects and articles, read/insert/update on templates (no
-- delete), and only previous_snapshot is writable on revisions.

GRANT USAGE ON SCHEMA public TO pin_werkstatt_agent;

GRANT SELECT ON public.agent_project_access TO pin_werkstatt_agent;
GRANT SELECT ON public.blog_projects TO pin_werkstatt_agent;
GRANT SELECT ON public.blog_articles TO pin_werkstatt_agent;
GRANT SELECT, INSERT, UPDATE ON public.pin_templates TO pin_werkstatt_agent;
GRANT SELECT ON public.pin_template_revisions TO pin_werkstatt_agent;
GRANT UPDATE (previous_snapshot) ON public.pin_template_revisions TO pin_werkstatt_agent;

-- ============================================================================
-- CLOSE PUBLIC EXECUTE ON SECURITY DEFINER FUNCTIONS
-- ============================================================================
-- Postgres grants EXECUTE on new functions to PUBLIC, i.e. to every role,
-- including pin_werkstatt_agent. These functions bypass RLS (vault secrets,
-- profiles), so the agent could otherwise read Gemini keys and Pinterest tokens.
-- anon/authenticated/service_role keep their explicit grants; only the implicit
-- PUBLIC grant is removed, so existing callers are unaffected.

REVOKE EXECUTE ON FUNCTION public.delete_gemini_api_key(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_pinterest_tokens(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_profile_exists() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_gemini_api_key(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pinterest_access_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pinterest_refresh_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_gemini_api_key(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.store_gemini_api_key(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.store_pinterest_tokens(uuid, text, text) FROM PUBLIC;

-- Used by the pin_templates CHECK constraints the agent writes against.
GRANT EXECUTE ON FUNCTION public.pin_template_normalize(text) TO pin_werkstatt_agent;

-- ============================================================================
-- RLS POLICIES (project-scoped)
-- ============================================================================

DROP POLICY IF EXISTS "Agent reads granted projects" ON public.blog_projects;
CREATE POLICY "Agent reads granted projects"
  ON public.blog_projects
  FOR SELECT
  TO pin_werkstatt_agent
  USING (
    id IN (
      SELECT blog_project_id FROM public.agent_project_access
      WHERE role_name = current_user
    )
  );

DROP POLICY IF EXISTS "Agent reads articles of granted projects" ON public.blog_articles;
CREATE POLICY "Agent reads articles of granted projects"
  ON public.blog_articles
  FOR SELECT
  TO pin_werkstatt_agent
  USING (
    blog_project_id IN (
      SELECT blog_project_id FROM public.agent_project_access
      WHERE role_name = current_user
    )
  );

DROP POLICY IF EXISTS "Agent reads templates of granted projects" ON public.pin_templates;
CREATE POLICY "Agent reads templates of granted projects"
  ON public.pin_templates
  FOR SELECT
  TO pin_werkstatt_agent
  USING (
    blog_article_id IN (
      SELECT a.id FROM public.blog_articles a
      JOIN public.agent_project_access g ON g.blog_project_id = a.blog_project_id
      WHERE g.role_name = current_user
    )
  );

DROP POLICY IF EXISTS "Agent inserts templates for granted projects" ON public.pin_templates;
CREATE POLICY "Agent inserts templates for granted projects"
  ON public.pin_templates
  FOR INSERT
  TO pin_werkstatt_agent
  WITH CHECK (
    blog_article_id IN (
      SELECT a.id FROM public.blog_articles a
      JOIN public.agent_project_access g ON g.blog_project_id = a.blog_project_id
      WHERE g.role_name = current_user
    )
  );

DROP POLICY IF EXISTS "Agent updates templates of granted projects" ON public.pin_templates;
CREATE POLICY "Agent updates templates of granted projects"
  ON public.pin_templates
  FOR UPDATE
  TO pin_werkstatt_agent
  USING (
    blog_article_id IN (
      SELECT a.id FROM public.blog_articles a
      JOIN public.agent_project_access g ON g.blog_project_id = a.blog_project_id
      WHERE g.role_name = current_user
    )
  )
  WITH CHECK (
    blog_article_id IN (
      SELECT a.id FROM public.blog_articles a
      JOIN public.agent_project_access g ON g.blog_project_id = a.blog_project_id
      WHERE g.role_name = current_user
    )
  );

DROP POLICY IF EXISTS "Agent reads revisions of granted projects" ON public.pin_template_revisions;
CREATE POLICY "Agent reads revisions of granted projects"
  ON public.pin_template_revisions
  FOR SELECT
  TO pin_werkstatt_agent
  USING (
    template_id IN (
      SELECT t.id FROM public.pin_templates t
      JOIN public.blog_articles a ON a.id = t.blog_article_id
      JOIN public.agent_project_access g ON g.blog_project_id = a.blog_project_id
      WHERE g.role_name = current_user
    )
  );

DROP POLICY IF EXISTS "Agent updates revisions of granted projects" ON public.pin_template_revisions;
CREATE POLICY "Agent updates revisions of granted projects"
  ON public.pin_template_revisions
  FOR UPDATE
  TO pin_werkstatt_agent
  USING (
    template_id IN (
      SELECT t.id FROM public.pin_templates t
      JOIN public.blog_articles a ON a.id = t.blog_article_id
      JOIN public.agent_project_access g ON g.blog_project_id = a.blog_project_id
      WHERE g.role_name = current_user
    )
  )
  WITH CHECK (
    template_id IN (
      SELECT t.id FROM public.pin_templates t
      JOIN public.blog_articles a ON a.id = t.blog_article_id
      JOIN public.agent_project_access g ON g.blog_project_id = a.blog_project_id
      WHERE g.role_name = current_user
    )
  );

-- ============================================================================
-- TRIGGER: DERIVE tenant_id FROM THE ARTICLE
-- ============================================================================
-- A template's tenant is always its article's tenant, for every writer. The
-- lookup runs as the invoking role, so an article outside the caller's scope
-- yields NULL and the NOT NULL constraint rejects the row.

CREATE OR REPLACE FUNCTION public.pin_templates_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.tenant_id := (
    SELECT a.tenant_id FROM public.blog_articles a WHERE a.id = NEW.blog_article_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_pin_templates_tenant_id ON public.pin_templates;
CREATE TRIGGER set_pin_templates_tenant_id
  BEFORE INSERT OR UPDATE OF blog_article_id, tenant_id ON public.pin_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.pin_templates_set_tenant_id();

-- ============================================================================
-- TRIGGER: PROTECT REVIEWED TEMPLATES FROM THE AGENT
-- ============================================================================
-- For the agent role only: approved/archived templates are read-only, and the
-- agent may only write the statuses draft or needs_revision. Approval and
-- archiving stay human actions in the Pinfinity UI.

CREATE OR REPLACE FUNCTION public.pin_templates_guard_agent_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user <> 'pin_werkstatt_agent' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'archived') THEN
    RAISE EXCEPTION 'pin template % is % and must not be changed by the agent', OLD.id, OLD.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status NOT IN ('draft', 'needs_revision') THEN
    RAISE EXCEPTION 'agent may only write status draft or needs_revision, got %', NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_pin_templates_agent_writes ON public.pin_templates;
CREATE TRIGGER guard_pin_templates_agent_writes
  BEFORE INSERT OR UPDATE ON public.pin_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.pin_templates_guard_agent_writes();

-- ============================================================================
-- SELF-DOCUMENTING SCHEMA (read by the agent via schema inspection)
-- ============================================================================

COMMENT ON TABLE public.pin_templates IS
  'Pin-Werkstatt: 30 pin templates (Vorlagen) per blog article, written by the external agent and reviewed by humans in Pinfinity. Upsert on (blog_article_id, position). Never change approved/archived rows. Write status draft; approval is a human action.';
COMMENT ON COLUMN public.pin_templates.tenant_id IS 'Set automatically from the article. Do not set.';
COMMENT ON COLUMN public.pin_templates.blog_article_id IS 'Article this template belongs to.';
COMMENT ON COLUMN public.pin_templates.position IS '1..30, unique per article.';
COMMENT ON COLUMN public.pin_templates.pin_type IS 'Pin type / angle of this template.';
COMMENT ON COLUMN public.pin_templates.status IS 'draft (new, awaiting review) | needs_revision (reviewer requested a change, see pin_template_revisions) | approved (human, read-only for agent) | archived (human, read-only for agent).';
COMMENT ON COLUMN public.pin_templates.title IS 'Pinterest pin title.';
COMMENT ON COLUMN public.pin_templates.description IS 'Pinterest pin description. Max 500 chars, must begin with main_keyword (case- and whitespace-insensitive).';
COMMENT ON COLUMN public.pin_templates.board_name_raw IS 'Target board name as free text; resolved to a real board on approval.';
COMMENT ON COLUMN public.pin_templates.overlay IS 'Text overlay on the image, lines separated by \n. Required, must contain main_keyword (case- and whitespace-insensitive).';
COMMENT ON COLUMN public.pin_templates.main_keyword IS 'Primary keyword. Required.';
COMMENT ON COLUMN public.pin_templates.longtails IS 'Long-tail keywords.';
COMMENT ON COLUMN public.pin_templates.search_phrases IS 'Pinterest search phrases this pin targets.';
COMMENT ON COLUMN public.pin_templates.quality_check IS 'Self-check notes of the agent.';
COMMENT ON COLUMN public.pin_templates.search_intent IS 'Search intent this pin addresses.';
COMMENT ON COLUMN public.pin_templates.image_idea IS 'Short human-readable image idea.';
COMMENT ON COLUMN public.pin_templates.image_prompt IS 'Finished image-generation prompt. Required.';
COMMENT ON COLUMN public.pin_templates.design IS 'JSON, all keys optional: {name, layout, image_position, fonts: string[], scroll_stopper, colors: string[] (hex)}.';
COMMENT ON COLUMN public.pin_templates.season IS 'Season / time of year the pin fits, if any.';

COMMENT ON TABLE public.pin_template_revisions IS
  'Revision requests from reviewers, newest first per template (max 3 kept). Agent: for templates with status needs_revision read the newest feedback, write the pre-rework template fields into previous_snapshot, rework the template, then set its status back to draft.';
COMMENT ON COLUMN public.pin_template_revisions.feedback IS 'What the reviewer wants changed.';
COMMENT ON COLUMN public.pin_template_revisions.previous_snapshot IS 'Template fields before the rework, as JSON. Written by the agent. The only column the agent may update.';

COMMENT ON COLUMN public.blog_articles.content IS 'Scraped article text (source material for pin templates).';
COMMENT ON COLUMN public.blog_articles.archived_at IS 'Set when the article is archived; archived articles need no new templates.';
COMMENT ON COLUMN public.blog_projects.ai_context IS 'Project-level brand and audience context for AI generation.';
