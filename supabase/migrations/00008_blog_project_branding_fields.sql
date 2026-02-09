-- Blog Project Branding Fields + Storage Buckets
-- Adds AI/branding metadata columns to blog_projects for Airtable migration
-- Creates board-covers and brand-kit storage buckets with RLS policies
-- Created: 2026-02-09

-- ============================================================================
-- BLOG_PROJECTS: ADD BRANDING FIELDS
-- ============================================================================
-- These columns store AI/branding metadata migrated from Airtable.
-- All fields are TEXT and nullable (not all projects have all fields).
-- Individual columns (not JSONB) per user decision for query flexibility.

ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS brand_voice TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS visual_style TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS general_keywords TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS value_proposition TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS style_options TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS main_motifs TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS color_palette TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS text_instructions TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS blog_niche TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS additional_instructions TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS topic_context TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS visual_audience TEXT;
ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS lighting_description TEXT;

-- ============================================================================
-- SUPABASE STORAGE: BOARD-COVERS BUCKET
-- ============================================================================
-- Public bucket for Pinterest board cover images migrated from Airtable.
-- Reads are public. Writes/updates/deletes are tenant-isolated using
-- folder structure pattern: {tenant_id}/{filename}

INSERT INTO storage.buckets (id, name, public)
VALUES ('board-covers', 'board-covers', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SUPABASE STORAGE: BRAND-KIT BUCKET
-- ============================================================================
-- Public bucket for brand kit files (logos, fonts, etc) migrated from Airtable.
-- Reads are public. Writes/updates/deletes are tenant-isolated using
-- folder structure pattern: {tenant_id}/{filename}

INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-kit', 'brand-kit', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STORAGE RLS POLICIES: BOARD-COVERS
-- ============================================================================

-- Policy: Anyone can view board cover images (public bucket)
CREATE POLICY "Board cover images are publicly readable"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'board-covers');

-- Policy: Authenticated users can upload to their tenant folder
CREATE POLICY "Users can upload board covers to own tenant folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'board-covers'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy: Authenticated users can update their own tenant's images
CREATE POLICY "Users can update board covers in own tenant folder"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'board-covers'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy: Authenticated users can delete their own tenant's images
CREATE POLICY "Users can delete board covers in own tenant folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'board-covers'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- STORAGE RLS POLICIES: BRAND-KIT
-- ============================================================================

-- Policy: Anyone can view brand kit files (public bucket)
CREATE POLICY "Brand kit files are publicly readable"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'brand-kit');

-- Policy: Authenticated users can upload to their tenant folder
CREATE POLICY "Users can upload brand kit files to own tenant folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-kit'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy: Authenticated users can update their own tenant's files
CREATE POLICY "Users can update brand kit files in own tenant folder"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'brand-kit'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy: Authenticated users can delete their own tenant's files
CREATE POLICY "Users can delete brand kit files in own tenant folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand-kit'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );
