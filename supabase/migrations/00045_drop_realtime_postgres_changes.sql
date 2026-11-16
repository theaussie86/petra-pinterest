-- Realtime cutover: drop postgres_changes publication (issue #153, follow-up)
-- Created: 2026-11-16
-- ============================================================================
-- POST-DEPLOY STEP. Apply this ONLY after the Broadcast-based client
-- (00044_realtime_broadcast_changes.sql + the updated front-end) is live and
-- verified. Until then the old client still relies on `postgres_changes`, and
-- these tables must stay in the `supabase_realtime` publication.
--
-- Removing them from the publication is what actually stops Realtime from
-- WAL-polling + running RLS per row — the pg_stat_statements hot spot this
-- issue targets. Guarded so a re-run is a no-op.
--
-- Rollback: `ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>;`

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pins',
    'blog_articles',
    'pin_publish_events',
    'pinterest_connections'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
        t
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;
