-- ============================================================================
-- Migration: scrape_blog queue (ADR-0004, issue #91)
-- ============================================================================
-- Replaces the scrape-scheduled + scrape-blog Edge Functions (HTTP fan-out)
-- with a pgmq queue that the scrape-blog-worker Edge Function drains. The
-- worker reads the sitemap with lastmod, diffs new + changed articles and
-- batch-enqueues every match into scrape_article (no 25-URL cap), then sets
-- last_scraped_at. Reuses the queue infrastructure from 00032 (pgmq extension,
-- queue_worker_locks, service-role-only pgmq wrappers, the generic
-- kick_queue_worker). Adds:
--
--   * pgmq queue `scrape_blog`
--   * queue_send_batch(queue, messages): service-role-only wrapper around
--     pgmq.send_batch, so the blog worker can enqueue scrape_article messages
--     without the pgmq schema being exposed over the Data API.
--   * enqueue_scrape_blog(blog_project_id): called by the app as the signed-in
--     user. SECURITY DEFINER, resolves the caller's tenant and rejects foreign
--     or unknown projects explicitly.
--   * enqueue_due_blog_scrapes(): the daily cron. Enqueues every project due
--     today (daily always, weekly on Sunday in UTC) directly via SQL, replacing
--     the scrape-scheduled Edge Function.
--   * pg_cron kick every 15 seconds via the shared kick_queue_worker.
--
-- Message payload: { blog_project_id, tenant_id }. Attempt limit 2 (read_ct).

BEGIN;

SELECT pgmq.create('scrape_blog');

-- ----------------------------------------------------------------------------
-- pgmq batch-send wrapper (service role only)
-- ----------------------------------------------------------------------------
-- The blog worker fans a scan out into many scrape_article messages. It runs as
-- service_role; this keeps the pgmq schema off the Data API like the read/
-- delete/archive wrappers from 00032. `p_messages` is a JSON array so PostgREST
-- passes it cleanly; it is expanded into the jsonb[] pgmq.send_batch expects.

CREATE OR REPLACE FUNCTION public.queue_send_batch(p_queue text, p_messages jsonb)
RETURNS SETOF bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pgmq.send_batch(p_queue, ARRAY(SELECT jsonb_array_elements(p_messages)));
$$;

REVOKE EXECUTE ON FUNCTION public.queue_send_batch(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_send_batch(text, jsonb) TO service_role;

-- ----------------------------------------------------------------------------
-- Enqueue from the app
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_scrape_blog(p_blog_project_id uuid)
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

  -- A foreign or unknown project rejects the request.
  IF NOT EXISTS (
    SELECT 1 FROM public.blog_projects
    WHERE id = p_blog_project_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  PERFORM pgmq.send(
    'scrape_blog',
    jsonb_build_object(
      'blog_project_id', p_blog_project_id,
      'tenant_id', v_tenant_id
    )
  );

  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_scrape_blog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_scrape_blog(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Daily scheduled run (replaces the scrape-scheduled Edge Function)
-- ----------------------------------------------------------------------------
-- Same due rules as the old function: `daily` projects every day, `weekly`
-- projects on Sunday. Sunday is measured in UTC to match the previous
-- getUTCDay() check, independent of the database session timezone.

CREATE OR REPLACE FUNCTION public.enqueue_due_blog_scrapes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH due AS (
    SELECT id, tenant_id
    FROM public.blog_projects
    WHERE scraping_frequency = 'daily'
       OR (scraping_frequency = 'weekly'
           AND EXTRACT(DOW FROM (now() AT TIME ZONE 'UTC')) = 0)
  ),
  sent AS (
    SELECT pgmq.send(
      'scrape_blog',
      jsonb_build_object('blog_project_id', id, 'tenant_id', tenant_id)
    )
    FROM due
  )
  SELECT count(*) INTO v_count FROM sent;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_due_blog_scrapes() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Cron: replace the scrape-scheduled Edge Function call with a direct SQL
-- enqueue, and add the 15s worker kick (shared kick_queue_worker from 00032).
-- ----------------------------------------------------------------------------

SELECT cron.unschedule('scrape-scheduled-daily');

SELECT cron.schedule(
  'enqueue-due-blog-scrapes-daily',
  '0 6 * * *',
  $$ SELECT public.enqueue_due_blog_scrapes(); $$
);

SELECT cron.schedule(
  'kick-scrape-blog-worker',
  '15 seconds',
  $$ SELECT public.kick_queue_worker('scrape_blog', 'scrape-blog-worker'); $$
);

COMMIT;
