-- ============================================================================
-- Migration: Dashboard stats aggregate RPC
-- ============================================================================
-- Adds public.get_dashboard_stats(): a single tenant-scoped aggregate returning
-- the dashboard's global pin counts plus per-project counts, replacing the
-- previous client fan-out that pulled every pin and article purely to count
-- them (PRD #46, issue #51).
--
-- SECURITY DEFINER so a single function call can aggregate across the tenant's
-- rows; because RLS is bypassed under DEFINER, the function MUST resolve and
-- filter by the caller's tenant_id explicitly (defence equivalent to the table
-- RLS policies: tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())).
--
-- Status buckets mirror the prior client-side logic (use-project-stats.ts):
--   published : status = 'published'
--   pending   : status IN ('draft','generate_metadata','generating_metadata','metadata_created')
--   scheduled : scheduled_at IS NOT NULL AND status <> 'published'
--   overdue   : scheduled_at IS NOT NULL AND scheduled_at < now() AND status <> 'published'
-- Articles count non-archived rows only (archived_at IS NULL), matching the old
-- getAllArticles query.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _tenant_id uuid;
  _result jsonb;
BEGIN
  SELECT p.tenant_id INTO _tenant_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  SELECT jsonb_build_object(
    'global', (
      SELECT jsonb_build_object(
        'scheduled', COUNT(*) FILTER (WHERE pn.scheduled_at IS NOT NULL AND pn.status <> 'published'),
        'published', COUNT(*) FILTER (WHERE pn.status = 'published'),
        'pending',   COUNT(*) FILTER (WHERE pn.status IN ('draft','generate_metadata','generating_metadata','metadata_created')),
        'overdue',   COUNT(*) FILTER (WHERE pn.scheduled_at IS NOT NULL AND pn.scheduled_at < now() AND pn.status <> 'published')
      )
      FROM public.pins pn
      WHERE pn.tenant_id = _tenant_id
    ),
    'projects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'project_id', pid,
        'articles', (
          SELECT COUNT(*) FROM public.blog_articles a
          WHERE a.blog_project_id = pid AND a.tenant_id = _tenant_id AND a.archived_at IS NULL
        ),
        'scheduled', (
          SELECT COUNT(*) FROM public.pins p
          WHERE p.blog_project_id = pid AND p.tenant_id = _tenant_id
            AND p.scheduled_at IS NOT NULL AND p.status <> 'published'
        ),
        'published', (
          SELECT COUNT(*) FROM public.pins p
          WHERE p.blog_project_id = pid AND p.tenant_id = _tenant_id AND p.status = 'published'
        )
      ))
      FROM (
        SELECT blog_project_id AS pid FROM public.pins WHERE tenant_id = _tenant_id
        UNION
        SELECT blog_project_id FROM public.blog_articles
          WHERE tenant_id = _tenant_id AND archived_at IS NULL
      ) projects
    ), '[]'::jsonb)
  )
  INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

COMMIT;
