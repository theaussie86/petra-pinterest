-- Realtime: Postgres Changes -> Broadcast (issue #153, "Skalierung 2b")
-- Split out of #150 (triage). Realtime `postgres_changes` is by far the largest
-- DB-time item in pg_stat_statements (WAL polling + per-event RLS, ~7M calls).
-- Supabase recommends Broadcast from database triggers at higher user counts.
-- Created: 2026-11-16
-- ============================================================================
-- This migration is ADDITIVE: it starts emitting Broadcast change
-- notifications and authorizes clients to read them, but does NOT yet remove
-- the tables from the `supabase_realtime` publication. The old client keeps
-- working on `postgres_changes` until the new (Broadcast) client is deployed.
-- The publication removal is a separate, post-deploy migration
-- (00045_drop_realtime_postgres_changes.sql) — see its header for ordering.
--
-- One private channel per tenant: topic `tenant:<tenant_id>`. A trigger on each
-- watched table calls `realtime.send` with a MINIMAL payload (table, operation,
-- ids) — never full rows, so no sensitive columns (e.g. Pinterest tokens) leak.
-- Clients subscribe with `config: { private: true }`; RLS on
-- `realtime.messages` lets a user read only their own tenant's topic.

BEGIN;

-- ============================================================================
-- TRIGGER FUNCTION
-- ============================================================================
-- SECURITY DEFINER so the pin_publish_events branch can read blog_projects to
-- resolve the tenant (that table carries blog_project_id, not tenant_id). The
-- payload is intentionally minimal; clients filter it by table/operation and an
-- optional column match (see src/lib/hooks/use-realtime.ts).

CREATE OR REPLACE FUNCTION public.broadcast_tenant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_blog_project_id uuid;
  v_pin_id uuid;
  v_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'pins' THEN
    IF TG_OP = 'DELETE' THEN
      v_tenant_id := OLD.tenant_id;
      v_blog_project_id := OLD.blog_project_id;
      v_id := OLD.id;
    ELSE
      v_tenant_id := NEW.tenant_id;
      v_blog_project_id := NEW.blog_project_id;
      v_id := NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'blog_articles' THEN
    IF TG_OP = 'DELETE' THEN
      v_tenant_id := OLD.tenant_id;
      v_blog_project_id := OLD.blog_project_id;
      v_id := OLD.id;
    ELSE
      v_tenant_id := NEW.tenant_id;
      v_blog_project_id := NEW.blog_project_id;
      v_id := NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'pinterest_connections' THEN
    IF TG_OP = 'DELETE' THEN
      v_tenant_id := OLD.tenant_id;
      v_id := OLD.id;
    ELSE
      v_tenant_id := NEW.tenant_id;
      v_id := NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'pin_publish_events' THEN
    IF TG_OP = 'DELETE' THEN
      v_blog_project_id := OLD.blog_project_id;
      v_pin_id := OLD.pin_id;
      v_id := OLD.id;
    ELSE
      v_blog_project_id := NEW.blog_project_id;
      v_pin_id := NEW.pin_id;
      v_id := NEW.id;
    END IF;
    SELECT tenant_id INTO v_tenant_id
      FROM public.blog_projects
      WHERE id = v_blog_project_id;
  END IF;

  -- No tenant to route to (e.g. project already deleted): skip silently.
  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'blog_project_id', v_blog_project_id,
      'pin_id', v_pin_id,
      'tenant_id', v_tenant_id,
      'id', v_id
    ),
    'change',                          -- event name
    'tenant:' || v_tenant_id::text,    -- topic: one private channel per tenant
    true                               -- private channel
  );

  RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$$;

COMMENT ON FUNCTION public.broadcast_tenant_change() IS
  'Emits a minimal tenant-scoped Realtime Broadcast (topic tenant:<tenant_id>, event "change") on changes to pins / blog_articles / pin_publish_events / pinterest_connections. Replaces postgres_changes subscriptions (issue #153).';

-- ============================================================================
-- TRIGGERS — only the operations the client actually subscribes to, to keep
-- Broadcast volume minimal (the client filters defensively anyway).
-- ============================================================================
DROP TRIGGER IF EXISTS broadcast_pins_update ON public.pins;
CREATE TRIGGER broadcast_pins_update
  AFTER UPDATE ON public.pins
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_tenant_change();

DROP TRIGGER IF EXISTS broadcast_blog_articles_insert ON public.blog_articles;
CREATE TRIGGER broadcast_blog_articles_insert
  AFTER INSERT ON public.blog_articles
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_tenant_change();

DROP TRIGGER IF EXISTS broadcast_pin_publish_events_insert ON public.pin_publish_events;
CREATE TRIGGER broadcast_pin_publish_events_insert
  AFTER INSERT ON public.pin_publish_events
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_tenant_change();

DROP TRIGGER IF EXISTS broadcast_pinterest_connections_update ON public.pinterest_connections;
CREATE TRIGGER broadcast_pinterest_connections_update
  AFTER UPDATE ON public.pinterest_connections
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_tenant_change();

-- ============================================================================
-- RLS on realtime.messages — authorize PRIVATE channel reads.
-- A user may read Broadcast messages only on their own tenant's topic. RLS is
-- already enabled on realtime.messages by Supabase; we only add the policy.
-- ============================================================================
DROP POLICY IF EXISTS "Tenant members read own broadcast" ON realtime.messages;
CREATE POLICY "Tenant members read own broadcast"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND realtime.topic() = 'tenant:' || (
      SELECT p.tenant_id::text
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
    )
  );

COMMIT;
