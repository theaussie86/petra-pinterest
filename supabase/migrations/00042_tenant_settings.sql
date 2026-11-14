-- ============================================================================
-- Migration: tenant_settings + AI metadata switch (ADR-0009)
-- ============================================================================
-- Per-tenant settings the user switches himself (unlike tenant_features, which
-- an admin sets by hand). First setting: ai_metadata_enabled. When false, no
-- path in Pinfinity calls Gemini for pin metadata; the user writes titles and
-- descriptions himself or lets a Connected Agent fill them in via MCP.
--
-- No row means the default (on). The app, the Edge Functions and the MCP server
-- treat a missing row - and a missing table, before this migration runs - as on.
--
-- enqueue_generate_metadata is replaced with a version that raises when the
-- setting is off. That is the hard stop for every queue path (UI bulk, UI auto
-- trigger after pin creation, MCP generate_metadata).
-- Created: 2026-11-14

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id UUID PRIMARY KEY,
  ai_metadata_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_settings IS
  'Per-tenant settings the user switches himself. One row per tenant; no row = all defaults.';
COMMENT ON COLUMN public.tenant_settings.ai_metadata_enabled IS
  'When false, Pinfinity never generates pin metadata with Gemini for this tenant (ADR-0009).';

DROP TRIGGER IF EXISTS set_tenant_settings_updated_at ON public.tenant_settings;
CREATE TRIGGER set_tenant_settings_updated_at
  BEFORE UPDATE ON public.tenant_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_settings TO authenticated;

CREATE POLICY "Users can view own tenant settings"
  ON public.tenant_settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own tenant settings"
  ON public.tenant_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own tenant settings"
  ON public.tenant_settings
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Service role full access tenant_settings"
  ON public.tenant_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- enqueue_generate_metadata: same as 00032, plus the AI metadata gate
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

  -- Hard stop: the tenant switched AI metadata off (no row = on).
  IF NOT coalesce(
    (SELECT s.ai_metadata_enabled FROM public.tenant_settings s WHERE s.tenant_id = v_tenant_id),
    true
  ) THEN
    RAISE EXCEPTION 'AI metadata generation is disabled for this account';
  END IF;

  SELECT count(DISTINCT id) INTO v_requested FROM unnest(p_pin_ids) AS id;
  IF v_requested = 0 THEN
    RETURN 0;
  END IF;

  -- All or nothing: a foreign or unknown pin id rejects the whole request.
  IF (
    SELECT count(*) FROM public.pins p
    WHERE p.id = ANY (p_pin_ids) AND p.tenant_id = v_tenant_id
  ) <> v_requested THEN
    RAISE EXCEPTION 'Pin not found';
  END IF;

  -- Only pins that may enter generation (docs/pin-status-flow.md); pins that
  -- are already generating, scheduled or published are skipped silently.
  -- The row lock keeps two concurrent requests from queueing the same pin.
  SELECT array_agg(p.id) INTO v_pin_ids
  FROM (
    SELECT id FROM public.pins
    WHERE id = ANY (p_pin_ids)
      AND tenant_id = v_tenant_id
      AND status IN ('draft', 'generate_metadata', 'metadata_created', 'error')
    FOR UPDATE
  ) p;

  IF v_pin_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.pins SET status = 'generating_metadata' WHERE id = ANY (v_pin_ids);

  PERFORM pgmq.send_batch(
    'generate_metadata',
    ARRAY(
      SELECT jsonb_build_object('pin_id', id, 'tenant_id', v_tenant_id)
      FROM unnest(v_pin_ids) AS id
    )
  );

  RETURN cardinality(v_pin_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_generate_metadata(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_generate_metadata(uuid[]) TO authenticated;

COMMIT;
