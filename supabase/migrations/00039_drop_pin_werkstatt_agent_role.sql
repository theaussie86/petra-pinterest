-- Drop the Pin-Werkstatt agent DB role and its second permission model.
-- Spec #115, issue #127, ADR-0006.
--
-- The external Pin-Werkstatt agent has worked through the MCP server at /mcp
-- under the user's OAuth token and RLS for a while now (ADR-0006). The old,
-- parallel permission model — a dedicated Postgres login role
-- `pin_werkstatt_agent` scoped per project via `public.agent_project_access`,
-- with its own `TO pin_werkstatt_agent` policies and a status-guard trigger —
-- is no longer used. Migration 00038 locked the role `NOLOGIN` (#126); this
-- migration removes it entirely. After this, the only permission model is RLS
-- over the user's JWT.
--
-- Apply this ONLY after the MCP Werkstatt path has run cleanly for a while
-- (issue #127 acceptance). This is NOT reversible via `ALTER ROLE ... WITH
-- LOGIN`; the full rollback is to re-run migrations 00029/00035-era grants.
-- The old role, policies and SQL-based skill live in the Git history
-- (migration 00029, `agent-skills/pin-werkstatt/references/sql.md` before #126)
-- if the whole MCP approach ever has to be undone.
--
-- Every step is guarded / `IF EXISTS` so the migration applies cleanly on a
-- fresh database, on one where only 00038 ran, and on one where it has already
-- been applied.

-- ============================================================================
-- RLS POLICIES (TO pin_werkstatt_agent)
-- ============================================================================
-- Dropped before the role so DROP ROLE is not blocked by policy references.

DROP POLICY IF EXISTS "Agent reads granted projects" ON public.blog_projects;
DROP POLICY IF EXISTS "Agent reads articles of granted projects" ON public.blog_articles;
DROP POLICY IF EXISTS "Agent reads templates of granted projects" ON public.pin_templates;
DROP POLICY IF EXISTS "Agent inserts templates for granted projects" ON public.pin_templates;
DROP POLICY IF EXISTS "Agent updates templates of granted projects" ON public.pin_templates;
DROP POLICY IF EXISTS "Agent reads revisions of granted projects" ON public.pin_template_revisions;
DROP POLICY IF EXISTS "Agent updates revisions of granted projects" ON public.pin_template_revisions;

-- ============================================================================
-- STATUS-GUARD TRIGGER (agent-only)
-- ============================================================================
-- The MCP Werkstatt tools (src/lib/mcp/tools/werkstatt.ts) enforce the
-- draft/needs_revision guardrail now (ADR-0006); the trigger only ever fired
-- for current_user = 'pin_werkstatt_agent', which no longer exists.
-- The tenant_id trigger (set_pin_templates_tenant_id) stays — it applies to
-- every writer.

DROP TRIGGER IF EXISTS guard_pin_templates_agent_writes ON public.pin_templates;
DROP FUNCTION IF EXISTS public.pin_templates_guard_agent_writes();

-- ============================================================================
-- PROJECT ACCESS TABLE
-- ============================================================================
-- Carried the per-project grants for the role; its own policies drop with it.

DROP TABLE IF EXISTS public.agent_project_access;

-- ============================================================================
-- ROLE
-- ============================================================================
-- DROP OWNED BY revokes every remaining privilege granted to the role
-- (schema usage, table grants, the pin_template_normalize EXECUTE grant) so
-- DROP ROLE is not blocked.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pin_werkstatt_agent') THEN
    DROP OWNED BY pin_werkstatt_agent;
    DROP ROLE pin_werkstatt_agent;
  END IF;
END
$$;
