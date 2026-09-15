-- ============================================================================
-- Migration: generate_metadata queue (ADR-0004, issue #87)
-- ============================================================================
-- Replaces Trigger.dev for bulk pin metadata generation with a pgmq queue that
-- an Edge Function worker drains. Pieces:
--
--   * pgmq extension + queue `generate_metadata`
--   * queue_worker_locks: at most one worker run per queue. Infra table without
--     tenant data; RLS on with no policies, so only service_role (and the
--     SECURITY DEFINER helpers below) can touch it.
--   * Service-role-only wrappers around pgmq read/delete/archive, so the pgmq
--     schema stays off the Data API.
--   * enqueue_generate_metadata(pin_ids): called by the app as the signed-in
--     user. SECURITY DEFINER, so it resolves the caller's tenant and rejects
--     pins outside it explicitly.
--   * kick_queue_worker + pg_cron every 15 seconds: calls the worker only when
--     visible messages wait and no worker run holds the lock.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgmq;

SELECT pgmq.create('generate_metadata');

-- ----------------------------------------------------------------------------
-- Worker lock
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.queue_worker_locks (
  queue_name text PRIMARY KEY,
  locked_until timestamptz NOT NULL
);

ALTER TABLE public.queue_worker_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.queue_worker_locks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.try_acquire_queue_worker_lock(p_queue text, p_ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_acquired boolean;
BEGIN
  -- Expiring lock instead of an advisory lock: every Data API call may run on a
  -- different pooled connection, and a crashed run must not block forever.
  INSERT INTO public.queue_worker_locks AS l (queue_name, locked_until)
  VALUES (p_queue, now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (queue_name) DO UPDATE
    SET locked_until = EXCLUDED.locked_until
    WHERE l.locked_until < now()
  RETURNING true INTO v_acquired;

  RETURN coalesce(v_acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_queue_worker_lock(p_queue text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.queue_worker_locks WHERE queue_name = p_queue;
$$;

-- ----------------------------------------------------------------------------
-- pgmq wrappers
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_read(p_queue text, p_vt integer, p_qty integer)
RETURNS SETOF pgmq.message_record
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM pgmq.read(p_queue, p_vt, p_qty);
$$;

CREATE OR REPLACE FUNCTION public.queue_delete(p_queue text, p_msg_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pgmq.delete(p_queue, p_msg_id);
$$;

CREATE OR REPLACE FUNCTION public.queue_archive(p_queue text, p_msg_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pgmq.archive(p_queue, p_msg_id);
$$;

REVOKE EXECUTE ON FUNCTION public.try_acquire_queue_worker_lock(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_queue_worker_lock(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_read(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_delete(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_archive(text, bigint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.try_acquire_queue_worker_lock(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_queue_worker_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_read(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_delete(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_archive(text, bigint) TO service_role;

-- ----------------------------------------------------------------------------
-- Enqueue from the app
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_generate_metadata(p_pin_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_pin_ids uuid[];
  v_requested integer;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(DISTINCT id) INTO v_requested FROM unnest(p_pin_ids) AS id;
  IF v_requested = 0 THEN
    RETURN 0;
  END IF;

  SELECT array_agg(p.id) INTO v_pin_ids
  FROM public.pins p
  WHERE p.id = ANY (p_pin_ids) AND p.tenant_id = v_tenant_id;

  -- All or nothing: a foreign or unknown pin id rejects the whole request.
  IF coalesce(cardinality(v_pin_ids), 0) <> v_requested THEN
    RAISE EXCEPTION 'Pin not found';
  END IF;

  UPDATE public.pins SET status = 'generating_metadata' WHERE id = ANY (v_pin_ids);

  PERFORM pgmq.send_batch(
    'generate_metadata',
    ARRAY(
      SELECT jsonb_build_object('pin_id', id, 'tenant_id', v_tenant_id)
      FROM unnest(v_pin_ids) AS id
    )
  );

  RETURN v_requested;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_generate_metadata(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_generate_metadata(uuid[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- Cron kick
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kick_queue_worker(p_queue text, p_function text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_waiting boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.queue_worker_locks
    WHERE queue_name = p_queue AND locked_until > now()
  ) THEN
    RETURN;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM pgmq.%I WHERE vt <= now())', 'q_' || p_queue)
    INTO v_waiting;
  IF NOT v_waiting THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_anon_key')
    ),
    body := jsonb_build_object('queue', p_queue),
    -- Keep the connection open for a full worker run (400s wall clock), like
    -- the other cron jobs, so the run is never cut off by the caller hanging up.
    timeout_milliseconds := 420000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kick_queue_worker(text, text) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'kick-generate-metadata-worker',
  '15 seconds',
  $$ SELECT public.kick_queue_worker('generate_metadata', 'generate-metadata-worker'); $$
);

COMMIT;
