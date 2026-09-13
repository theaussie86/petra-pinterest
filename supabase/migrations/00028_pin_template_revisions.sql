-- Pin Template Revisions (Änderungswünsche mit Historie)
-- Immutable log of revision requests a reviewer sends to the external agent for
-- a pin template. Submitting a request records a row here and moves the template
-- to `needs_revision`; the agent picks up open requests, reworks the template and
-- sets the status back to `draft`.
-- Created: 2026-09-13 (issue #79, epic #74)

-- ============================================================================
-- PIN_TEMPLATE_REVISIONS TABLE
-- ============================================================================
-- One row per revision request. Immutable — there is no `updated_at`. The
-- application layer keeps only the last 3 rows per template.
-- `previous_snapshot` holds the template fields before the rework and is written
-- by the external agent (service role) when it reworks the template.
-- All data is isolated by tenant_id for multi-tenant security.

CREATE TABLE IF NOT EXISTS public.pin_template_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.pin_templates(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL,
  previous_snapshot JSONB,          -- Template fields before the rework, set by the agent
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.pin_template_revisions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
-- (template_id, created_at DESC) powers the "newest first" history lookup and
-- the retention pruning.

CREATE INDEX IF NOT EXISTS idx_pin_template_revisions_template_created
  ON public.pin_template_revisions(template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pin_template_revisions_tenant_id
  ON public.pin_template_revisions(tenant_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
-- Tenant isolation for authenticated users, matching the standard pattern,
-- plus a service_role bypass policy for the external agent that reworks
-- templates and writes `previous_snapshot`.

-- Policy 1: Users can view revisions in their tenant
CREATE POLICY "Users can view own tenant pin template revisions"
  ON public.pin_template_revisions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 2: Users can insert revisions in their tenant
CREATE POLICY "Users can insert pin template revisions in own tenant"
  ON public.pin_template_revisions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 3: Users can delete revisions in their tenant (retention pruning)
CREATE POLICY "Users can delete own tenant pin template revisions"
  ON public.pin_template_revisions
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 4: Service role full access for the external agent
CREATE POLICY "Service role full access pin_template_revisions"
  ON public.pin_template_revisions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
