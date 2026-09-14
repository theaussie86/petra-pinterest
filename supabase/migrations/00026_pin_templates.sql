-- Pin Templates Table (Pin-Werkstatt)
-- Multi-tenant table for storing pin templates ("Vorlagen") produced by an
-- external agent and reviewed inside Pinfinity.
-- Created: 2026-09-13 (issue #75, epic #74)

-- ============================================================================
-- PIN_TEMPLATES TABLE
-- ============================================================================
-- Each template hangs directly off a blog article (no campaign table in v1).
-- Templates are created exclusively by an external agent via the service role;
-- the app only displays them, changes their status and records revision
-- requests. Template texts are not edited in the UI.
-- All data is isolated by tenant_id for multi-tenant security.

CREATE TABLE IF NOT EXISTS public.pin_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  blog_article_id UUID NOT NULL REFERENCES public.blog_articles(id) ON DELETE CASCADE,
  position INT NOT NULL,
  pin_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'needs_revision',
    'approved',
    'archived'
  )),
  title TEXT,
  description TEXT,
  board_name_raw TEXT,              -- Free text, resolved to a real board on approval
  overlay TEXT,                     -- Overlay lines separated by \n
  main_keyword TEXT NOT NULL,
  longtails TEXT[],
  search_phrases TEXT[],
  quality_check TEXT[],
  search_intent TEXT,
  image_idea TEXT,
  image_prompt TEXT NOT NULL,
  design JSONB,                     -- name, layout, image_position, fonts[], scroll_stopper, colors[]
  season TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UNIQUE CONSTRAINT
-- ============================================================================
-- Positions are unique within an article (1..N, no duplicates per article).

CREATE UNIQUE INDEX IF NOT EXISTS idx_pin_templates_article_position
  ON public.pin_templates(blog_article_id, position);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY
-- ============================================================================
-- RLS ensures users can only access templates within their tenant.

ALTER TABLE public.pin_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pin_templates_tenant_id
  ON public.pin_templates(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pin_templates_blog_article_id
  ON public.pin_templates(blog_article_id);

CREATE INDEX IF NOT EXISTS idx_pin_templates_status
  ON public.pin_templates(status);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
-- Tenant isolation for authenticated users, matching the standard pattern,
-- plus a service_role bypass policy for the external agent that inserts
-- templates directly into the database.

-- Policy 1: Users can view templates in their tenant
CREATE POLICY "Users can view own tenant pin templates"
  ON public.pin_templates
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 2: Users can insert templates in their tenant
CREATE POLICY "Users can insert pin templates in own tenant"
  ON public.pin_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 3: Users can update templates in their tenant
CREATE POLICY "Users can update own tenant pin templates"
  ON public.pin_templates
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 4: Users can delete templates in their tenant
CREATE POLICY "Users can delete own tenant pin templates"
  ON public.pin_templates
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 5: Service role full access for the external agent ingest
CREATE POLICY "Service role full access pin_templates"
  ON public.pin_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE updated_at TIMESTAMP
-- ============================================================================
-- Reuse the handle_updated_at() function from 00001_initial_schema.sql

DROP TRIGGER IF EXISTS set_pin_templates_updated_at ON public.pin_templates;
CREATE TRIGGER set_pin_templates_updated_at
  BEFORE UPDATE ON public.pin_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
