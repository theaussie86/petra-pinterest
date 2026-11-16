-- ============================================================================
-- Migration: reduce pg_cron load (PostgREST outage 2026-11-16)
-- ============================================================================
-- On 2026-11-16 PostgREST stopped answering (pool of 10 drained by connections
-- stuck "idle in transaction", every request 504 after 125s) until the project
-- was restarted. Simple indexed queries had already slowed from <50ms to 2.5s,
-- so the instance was starved. Two permanent load sources come from pg_cron:
--
--   1. Three queue kicks every 15 seconds, around the clock (~17k runs/day).
--      They now run once a minute. Up to ~60s delay before a queued job starts
--      is fine for background work (ADR-0004 accepted ~15s). Single-pin
--      actions bypass the queue and are not affected.
--   2. cron.job_run_details was never cleaned: 1.08M rows, 232 MB, the largest
--      table in the database. A daily job now deletes runs older than 1 day,
--      and this migration clears the backlog once.
--
-- cron.schedule with an existing job name updates that job in place.
-- Created: 2026-11-16

BEGIN;

SELECT cron.schedule(
  'kick-generate-metadata-worker',
  '* * * * *',
  $$ SELECT public.kick_queue_worker('generate_metadata', 'generate-metadata-worker'); $$
);

SELECT cron.schedule(
  'kick-scrape-article-worker',
  '* * * * *',
  $$ SELECT public.kick_queue_worker('scrape_article', 'scrape-article-worker'); $$
);

SELECT cron.schedule(
  'kick-scrape-blog-worker',
  '* * * * *',
  $$ SELECT public.kick_queue_worker('scrape_blog', 'scrape-blog-worker'); $$
);

SELECT cron.schedule(
  'cleanup-cron-job-run-details',
  '30 3 * * *',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '1 day'; $$
);

DELETE FROM cron.job_run_details WHERE end_time < now() - interval '1 day';

COMMIT;
