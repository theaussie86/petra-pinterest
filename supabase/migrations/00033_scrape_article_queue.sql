-- ============================================================================
-- Migration: scrape_article queue (ADR-0004, issue #90)
-- ============================================================================
-- Replaces Trigger.dev for single-article scraping with a pgmq queue that the
-- scrape-article-worker Edge Function drains. Reuses the queue infrastructure
-- from 00032 (pgmq extension, queue_worker_locks, service-role-only pgmq
-- wrappers and the generic kick_queue_worker). Adds only:
--
--   * pgmq queue `scrape_article`
--   * enqueue_scrape_article(blog_project_id, url): called by the app as the
--     signed-in user. SECURITY DEFINER, resolves the caller's tenant and
--     rejects projects outside it explicitly.
--   * pg_cron kick every 15 seconds via the shared kick_queue_worker.
--
-- Message payload: { blog_project_id, url, tenant_id }. Attempt limit 3 (read_ct).

BEGIN;

SELECT pgmq.create('scrape_article');

-- ----------------------------------------------------------------------------
-- Enqueue from the app
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_scrape_article(p_blog_project_id uuid, p_url text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_url IS NULL OR btrim(p_url) = '' THEN
    RAISE EXCEPTION 'URL required';
  END IF;

  -- A foreign or unknown project rejects the request.
  IF NOT EXISTS (
    SELECT 1 FROM public.blog_projects
    WHERE id = p_blog_project_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  PERFORM pgmq.send(
    'scrape_article',
    jsonb_build_object(
      'blog_project_id', p_blog_project_id,
      'url', btrim(p_url),
      'tenant_id', v_tenant_id
    )
  );

  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_scrape_article(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_scrape_article(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Cron kick (shared kick_queue_worker from 00032)
-- ----------------------------------------------------------------------------

SELECT cron.schedule(
  'kick-scrape-article-worker',
  '15 seconds',
  $$ SELECT public.kick_queue_worker('scrape_article', 'scrape-article-worker'); $$
);

COMMIT;
