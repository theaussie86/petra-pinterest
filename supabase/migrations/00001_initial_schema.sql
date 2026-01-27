-- Initial Schema for Petra Pinterest
-- Multi-tenant Row Level Security (RLS) Foundation
-- Created: 2026-01-27

-- ============================================================================
-- PROFILES TABLE (extends auth.users)
-- ============================================================================
-- This table stores user profile information and establishes tenant boundaries.
-- Each user belongs to a tenant, enabling multi-tenant data isolation.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY
-- ============================================================================
-- RLS must be enabled BEFORE any production data enters the system.
-- This ensures that users can only access data within their tenant.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEX
-- ============================================================================
-- Index on tenant_id for fast multi-tenant queries

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
-- These policies enforce that users can only access their own profile data.
-- Note: (SELECT auth.uid()) wraps the function call for caching/performance.

-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

-- Policy 2: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- ============================================================================
-- AUTO-CREATE PROFILE ON USER SIGNUP
-- ============================================================================
-- This trigger automatically creates a profile when a new user signs up.
-- SECURITY DEFINER allows the trigger to bypass RLS for profile creation.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, tenant_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    gen_random_uuid(),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- AUTO-UPDATE updated_at TIMESTAMP
-- ============================================================================
-- This trigger automatically updates the updated_at column on row updates.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to profiles
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
