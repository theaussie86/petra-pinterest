-- Blog Projects Table
-- Multi-tenant table for managing blog projects with Pinterest integration
-- Created: 2026-01-27

-- ============================================================================
-- BLOG_PROJECTS TABLE
-- ============================================================================
-- Each blog project represents a blog with its own Pinterest account.
-- All data is isolated by tenant_id for multi-tenant security.

CREATE TABLE IF NOT EXISTS public.blog_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  blog_url TEXT NOT NULL,
  rss_url TEXT,
  scraping_frequency TEXT DEFAULT 'weekly' CHECK (scraping_frequency IN ('daily', 'weekly', 'manual')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY
-- ============================================================================
-- RLS ensures users can only access blog projects within their tenant

ALTER TABLE public.blog_projects ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEX
-- ============================================================================
-- Index on tenant_id for fast multi-tenant queries

CREATE INDEX IF NOT EXISTS idx_blog_projects_tenant_id ON public.blog_projects(tenant_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
-- These policies enforce tenant isolation for blog projects.
-- Pattern matches Phase 1 tenant isolation from profiles table.

-- Policy 1: Users can view blog projects in their tenant
CREATE POLICY "Users can view own tenant blog projects"
  ON public.blog_projects
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 2: Users can insert blog projects in their tenant
CREATE POLICY "Users can insert blog projects in own tenant"
  ON public.blog_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 3: Users can update blog projects in their tenant
CREATE POLICY "Users can update own tenant blog projects"
  ON public.blog_projects
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

-- Policy 4: Users can delete blog projects in their tenant
CREATE POLICY "Users can delete own tenant blog projects"
  ON public.blog_projects
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

DROP TRIGGER IF EXISTS set_blog_projects_updated_at ON public.blog_projects;
CREATE TRIGGER set_blog_projects_updated_at
  BEFORE UPDATE ON public.blog_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
