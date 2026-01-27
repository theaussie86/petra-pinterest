-- Blog Articles Table
-- Multi-tenant table for storing scraped blog articles
-- Created: 2026-01-27

-- ============================================================================
-- BLOG_ARTICLES TABLE
-- ============================================================================
-- Each article represents a scraped blog post linked to a blog project.
-- Articles support soft delete via archived_at column.
-- All data is isolated by tenant_id for multi-tenant security.

CREATE TABLE IF NOT EXISTS public.blog_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  blog_project_id UUID NOT NULL REFERENCES public.blog_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  content TEXT,  -- Full scraped article content (HTML)
  published_at TIMESTAMPTZ,  -- Original publish date from blog
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- Last scrape timestamp
  archived_at TIMESTAMPTZ,  -- Soft delete: NULL = active, non-NULL = archived
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- UNIQUE CONSTRAINT
-- ============================================================================
-- Prevent duplicate articles per project (enables upsert behavior)

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_articles_project_url
  ON public.blog_articles(blog_project_id, url);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY
-- ============================================================================
-- RLS ensures users can only access articles within their tenant

ALTER TABLE public.blog_articles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Index on tenant_id for fast multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_blog_articles_tenant_id
  ON public.blog_articles(tenant_id);

-- Index on blog_project_id for project-filtered queries
CREATE INDEX IF NOT EXISTS idx_blog_articles_blog_project_id
  ON public.blog_articles(blog_project_id);

-- Index on published_at for sorting (newest first)
CREATE INDEX IF NOT EXISTS idx_blog_articles_published_at
  ON public.blog_articles(published_at DESC);

-- Index on archived_at for filtering active articles
CREATE INDEX IF NOT EXISTS idx_blog_articles_archived_at
  ON public.blog_articles(archived_at);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
-- These policies enforce tenant isolation for blog articles.
-- Pattern matches blog_projects table policies.

-- Policy 1: Users can view articles in their tenant
CREATE POLICY "Users can view own tenant blog articles"
  ON public.blog_articles
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 2: Users can insert articles in their tenant
CREATE POLICY "Users can insert blog articles in own tenant"
  ON public.blog_articles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 3: Users can update articles in their tenant
CREATE POLICY "Users can update own tenant blog articles"
  ON public.blog_articles
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

-- Policy 4: Users can delete articles in their tenant
CREATE POLICY "Users can delete own tenant blog articles"
  ON public.blog_articles
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- AUTO-UPDATE updated_at TIMESTAMP
-- ============================================================================
-- Reuse the handle_updated_at() function from 00001_initial_schema.sql

DROP TRIGGER IF EXISTS set_blog_articles_updated_at ON public.blog_articles;
CREATE TRIGGER set_blog_articles_updated_at
  BEFORE UPDATE ON public.blog_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
