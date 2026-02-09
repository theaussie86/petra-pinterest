-- Pins Table + Pin Images Storage Bucket
-- Multi-tenant table for managing Pinterest pins and pin images
-- Created: 2026-01-28

-- ============================================================================
-- PINS TABLE
-- ============================================================================
-- Each pin represents a Pinterest pin image generated from a blog article.
-- Pins progress through a multi-step workflow tracked by the status column.
-- image_path references a file in the pin-images Supabase Storage bucket.
-- pinterest_board_id and pinterest_board_name store the target board directly
-- (boards are fetched live from the Pinterest API, not stored locally).
-- All data is isolated by tenant_id for multi-tenant security.

CREATE TABLE IF NOT EXISTS public.pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  blog_project_id UUID NOT NULL REFERENCES public.blog_projects(id) ON DELETE CASCADE,
  blog_article_id UUID NOT NULL REFERENCES public.blog_articles(id) ON DELETE CASCADE,
  pinterest_board_id TEXT,
  pinterest_board_name TEXT,
  image_path TEXT NOT NULL,         -- Supabase Storage path (e.g., "{tenant_id}/{pin_id}.jpg")
  title TEXT,                       -- Pin title (filled later, nullable)
  description TEXT,                 -- Pin description (filled later, nullable)
  status TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN (
    'entwurf',
    'bereit_fuer_generierung',
    'pin_generieren',
    'pin_wird_generiert',
    'pin_generiert',
    'metadaten_generieren',
    'metadaten_werden_generiert',
    'metadaten_erstellt',
    'bereit_zum_planen',
    'veroeffentlicht',
    'fehler',
    'loeschen'
  )),
  error_message TEXT,               -- Error details when status = 'fehler'
  scheduled_at TIMESTAMPTZ,         -- When pin is scheduled (Phase 5+)
  published_at TIMESTAMPTZ,         -- When pin was published (Phase 5+)
  pinterest_pin_id TEXT,            -- Pinterest external ID (after publishing via n8n)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY (PINS)
-- ============================================================================
-- RLS ensures users can only access pins within their tenant

ALTER TABLE public.pins ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEXES (PINS)
-- ============================================================================

-- Index on tenant_id for fast multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_pins_tenant_id
  ON public.pins(tenant_id);

-- Index on blog_project_id for project-filtered queries
CREATE INDEX IF NOT EXISTS idx_pins_blog_project_id
  ON public.pins(blog_project_id);

-- Index on blog_article_id for article-filtered queries
CREATE INDEX IF NOT EXISTS idx_pins_blog_article_id
  ON public.pins(blog_article_id);

-- Index on pinterest_board_id for board-filtered queries
CREATE INDEX IF NOT EXISTS idx_pins_pinterest_board_id
  ON public.pins(pinterest_board_id);

-- Index on status for workflow state queries
CREATE INDEX IF NOT EXISTS idx_pins_status
  ON public.pins(status);

-- Index on scheduled_at for calendar/scheduling queries
CREATE INDEX IF NOT EXISTS idx_pins_scheduled_at
  ON public.pins(scheduled_at);

-- ============================================================================
-- RLS POLICIES (PINS)
-- ============================================================================
-- These policies enforce tenant isolation for pins.
-- Pattern matches blog_articles table policies.

-- Policy 1: Users can view pins in their tenant
CREATE POLICY "Users can view own tenant pins"
  ON public.pins
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 2: Users can insert pins in their tenant
CREATE POLICY "Users can insert pins in own tenant"
  ON public.pins
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 3: Users can update pins in their tenant
CREATE POLICY "Users can update own tenant pins"
  ON public.pins
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

-- Policy 4: Users can delete pins in their tenant
CREATE POLICY "Users can delete own tenant pins"
  ON public.pins
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- AUTO-UPDATE updated_at TIMESTAMP (PINS)
-- ============================================================================
-- Reuse the handle_updated_at() function from 00001_initial_schema.sql

DROP TRIGGER IF EXISTS set_pins_updated_at ON public.pins;
CREATE TRIGGER set_pins_updated_at
  BEFORE UPDATE ON public.pins
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================================
-- SUPABASE STORAGE: PIN-IMAGES BUCKET
-- ============================================================================
-- Public bucket for pin images. Reads are public (images displayed in
-- calendar and shared contexts). Writes/updates/deletes are tenant-isolated
-- using the folder structure pattern: {tenant_id}/{pin_id}.{ext}

INSERT INTO storage.buckets (id, name, public)
VALUES ('pin-images', 'pin-images', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE RLS POLICIES
-- ============================================================================

-- Policy: Authenticated users can upload to their tenant folder
CREATE POLICY "Users can upload pin images to own tenant folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pin-images'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy: Anyone can view pin images (public bucket)
CREATE POLICY "Pin images are publicly readable"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'pin-images');

-- Policy: Authenticated users can update their own tenant's images
CREATE POLICY "Users can update pin images in own tenant folder"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'pin-images'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy: Authenticated users can delete their own tenant's images
CREATE POLICY "Users can delete pin images in own tenant folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pin-images'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );
