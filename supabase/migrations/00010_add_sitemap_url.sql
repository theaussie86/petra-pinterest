-- Add sitemap_url column to blog_projects
-- This column was already present in the TypeScript types and UI but had no backing DB column.
-- Created: 2026-02-12

ALTER TABLE public.blog_projects ADD COLUMN IF NOT EXISTS sitemap_url TEXT;
