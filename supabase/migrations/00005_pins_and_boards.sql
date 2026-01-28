-- Pins and Boards Tables + Pin Images Storage Bucket
-- Multi-tenant tables for managing Pinterest pins, boards, and pin images
-- Created: 2026-01-28

-- ============================================================================
-- BOARDS TABLE
-- ============================================================================
-- Each board represents a Pinterest board linked to a blog project.
-- Boards are synced from Pinterest via n8n; pinterest_board_id stores the
-- external Pinterest identifier for upsert support.
-- All data is isolated by tenant_id for multi-tenant security.

CREATE TABLE IF NOT EXISTS public.boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  blog_project_id UUID NOT NULL REFERENCES public.blog_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pinterest_board_id TEXT,          -- Pinterest external ID (synced via n8n)
  cover_image_url TEXT,             -- Board cover image URL from Pinterest
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UNIQUE CONSTRAINT (BOARDS)
-- ============================================================================
-- Prevent duplicate Pinterest boards per project (enables upsert behavior)

CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_project_pinterest_id
  ON public.boards(blog_project_id, pinterest_board_id);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY (BOARDS)
-- ============================================================================
-- RLS ensures users can only access boards within their tenant

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEXES (BOARDS)
-- ============================================================================

-- Index on tenant_id for fast multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_boards_tenant_id
  ON public.boards(tenant_id);

-- Index on blog_project_id for project-filtered queries
CREATE INDEX IF NOT EXISTS idx_boards_blog_project_id
  ON public.boards(blog_project_id);

-- ============================================================================
-- RLS POLICIES (BOARDS)
-- ============================================================================
-- These policies enforce tenant isolation for boards.
-- Pattern matches blog_articles table policies.

-- Policy 1: Users can view boards in their tenant
CREATE POLICY "Users can view own tenant boards"
  ON public.boards
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 2: Users can insert boards in their tenant
CREATE POLICY "Users can insert boards in own tenant"
  ON public.boards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 3: Users can update boards in their tenant
CREATE POLICY "Users can update own tenant boards"
  ON public.boards
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

-- Policy 4: Users can delete boards in their tenant
CREATE POLICY "Users can delete own tenant boards"
  ON public.boards
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- AUTO-UPDATE updated_at TIMESTAMP (BOARDS)
-- ============================================================================
-- Reuse the handle_updated_at() function from 00001_initial_schema.sql

DROP TRIGGER IF EXISTS set_boards_updated_at ON public.boards;
CREATE TRIGGER set_boards_updated_at
  BEFORE UPDATE ON public.boards
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================================
-- PINS TABLE
-- ============================================================================
-- Each pin represents a Pinterest pin image generated from a blog article.
-- Pins progress through a multi-step workflow tracked by the status column.
-- image_path references a file in the pin-images Supabase Storage bucket.
-- All data is isolated by tenant_id for multi-tenant security.

CREATE TABLE IF NOT EXISTS public.pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  blog_project_id UUID NOT NULL REFERENCES public.blog_projects(id) ON DELETE CASCADE,
  blog_article_id UUID NOT NULL REFERENCES public.blog_articles(id) ON DELETE CASCADE,
  board_id UUID REFERENCES public.boards(id) ON DELETE SET NULL,  -- nullable, assigned later
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

-- Index on board_id for board-filtered queries
CREATE INDEX IF NOT EXISTS idx_pins_board_id
  ON public.pins(board_id);

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
