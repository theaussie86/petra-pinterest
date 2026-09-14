-- Tenant Feature Flags
-- Per-tenant switches for features that are not rolled out to everyone yet.
-- The app reads the caller's own flags into the auth user context and hides
-- gated navigation and routes. Flags are managed by hand in the SQL editor:
-- authenticated users can read their own tenant's flags but never write them.
-- Created: 2026-09-14 (epic #74, Pin-Werkstatt rollout)
--
-- Enable / disable a feature for a tenant:
--   INSERT INTO public.tenant_features (tenant_id, feature)
--   VALUES ('<tenant_id>', 'pin_werkstatt') ON CONFLICT DO NOTHING;
--   DELETE FROM public.tenant_features
--   WHERE tenant_id = '<tenant_id>' AND feature = 'pin_werkstatt';
--
-- Adding a new feature key: extend the CHECK constraint and the TypeScript
-- `FeatureKey` union in src/lib/features.ts.

CREATE TABLE IF NOT EXISTS public.tenant_features (
  tenant_id UUID NOT NULL,
  feature TEXT NOT NULL CHECK (feature IN ('pin_werkstatt')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature)
);

COMMENT ON TABLE public.tenant_features IS
  'Per-tenant feature flags. One row = feature enabled for that tenant. Managed manually; users can only read their own tenant''s flags.';

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_features FROM anon, authenticated;
GRANT SELECT ON public.tenant_features TO authenticated;

CREATE POLICY "Users can view own tenant features"
  ON public.tenant_features
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Service role full access tenant_features"
  ON public.tenant_features
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
