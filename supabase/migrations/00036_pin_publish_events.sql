-- Pin Publish Events (MQ publishing history + global log)
-- Issue #109, PRD weissteiner-automation-mq#5 (Teil 2: Events und Logs).
-- Created: 2026-10-10
-- ============================================================================
-- The MQ worker (BullMQ queue `integrations`) writes one row per publish
-- attempt into this table using the Supabase service-role key (credential
-- `pinfinity-supabase`, ADR-0009), which bypasses RLS. Pinfinity only reads:
--   - per-pin history (filtered by pin_id)
--   - a global log (ordered by created_at)
-- and subscribes over Realtime so the UI updates live.
--
-- Retention is 90 days, enforced by an MQ cleanup job (ticket in the MQ repo);
-- nothing to schedule here. The (created_at DESC) index keeps that age-based
-- delete fast.

BEGIN;

-- ============================================================================
-- TABLE
-- ============================================================================
-- blog_project_id is denormalised (copied from the pin's project) so RLS and
-- "filter by project" queries do not need to join through pins. attempt /
-- max_attempts are NULL for mail_sent events. details carries the structured
-- payload (http_status, error_class = retryable|unrecoverable, next_retry_at,
-- job_id, pinterest_pin_id, recipient, ...).

CREATE TABLE IF NOT EXISTS public.pin_publish_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES public.pins(id) ON DELETE CASCADE,
  blog_project_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'attempt_started',
    'succeeded',
    'retry_scheduled',
    'failed_final',
    'mail_sent'
  )),
  attempt INT,
  max_attempts INT,
  message TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pin_publish_events IS
  'Append-only publish attempt log per pin, written by the MQ worker with the service-role key. Read-only for app users (tenant-scoped via blog_project_id). Retention 90 days (MQ cleanup job).';

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Per-pin history (most recent first).
CREATE INDEX IF NOT EXISTS idx_pin_publish_events_pin_created
  ON public.pin_publish_events(pin_id, created_at DESC);

-- Per-project filtered log.
CREATE INDEX IF NOT EXISTS idx_pin_publish_events_project_created
  ON public.pin_publish_events(blog_project_id, created_at DESC);

-- Global log + fast age-based retention delete.
CREATE INDEX IF NOT EXISTS idx_pin_publish_events_created
  ON public.pin_publish_events(created_at DESC);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.pin_publish_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
-- Read-only for authenticated users, scoped to the tenant of the event's
-- project (same tenant rule as pins/blog_projects, reached via blog_project_id
-- since this table carries no own tenant_id). No INSERT/UPDATE/DELETE policy
-- for authenticated: writes happen only with the service-role key.

CREATE POLICY "Users can view own tenant pin publish events"
  ON public.pin_publish_events
  FOR SELECT
  TO authenticated
  USING (
    blog_project_id IN (
      SELECT id FROM public.blog_projects
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
      )
    )
  );

-- Service-role bypass for the MQ worker (writes every publish event).
CREATE POLICY "Service role full access pin publish events"
  ON public.pin_publish_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- REALTIME
-- ============================================================================
-- Publish the table so Pinfinity can live-update the pin history and log.
-- Guarded so re-running the migration does not fail if already a member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pin_publish_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pin_publish_events;
  END IF;
END
$$;

COMMIT;
