-- ============================================================================
-- Pinterest OAuth Foundation
-- ============================================================================
-- Creates pinterest_connections and oauth_state_mapping tables for OAuth flow.
-- Adds pinterest_connection_id to blog_projects, pinterest_pin_url to pins.
-- Adds 'publishing' status to pin workflow.
-- Sets up Supabase Vault for encrypted token storage.
-- Adds service_role bypass policies for Inngest background jobs.
-- Created: 2026-02-09

-- ============================================================================
-- STEP 1: ENABLE SUPABASE VAULT EXTENSION
-- ============================================================================
-- Vault provides encrypted secret storage for Pinterest OAuth tokens

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- ============================================================================
-- STEP 2: PINTEREST_CONNECTIONS TABLE
-- ============================================================================
-- Stores Pinterest account connections for multi-account publishing.
-- Tokens are encrypted in vault; this table stores metadata and expiration.

CREATE TABLE IF NOT EXISTS public.pinterest_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  pinterest_user_id TEXT NOT NULL,
  pinterest_username TEXT,
  scope TEXT,
  token_expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: prevent duplicate Pinterest accounts per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_pinterest_connections_tenant_user
  ON public.pinterest_connections(tenant_id, pinterest_user_id);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY (PINTEREST_CONNECTIONS)
-- ============================================================================

ALTER TABLE public.pinterest_connections ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEXES (PINTEREST_CONNECTIONS)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pinterest_connections_tenant_id
  ON public.pinterest_connections(tenant_id);

-- ============================================================================
-- RLS POLICIES (PINTEREST_CONNECTIONS)
-- ============================================================================

-- Policy 1: Users can view connections in their tenant
CREATE POLICY "Users can view own tenant pinterest connections"
  ON public.pinterest_connections
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 2: Users can insert connections in their tenant
CREATE POLICY "Users can insert pinterest connections in own tenant"
  ON public.pinterest_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 3: Users can update connections in their tenant
CREATE POLICY "Users can update own tenant pinterest connections"
  ON public.pinterest_connections
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

-- Policy 4: Users can delete connections in their tenant
CREATE POLICY "Users can delete own tenant pinterest connections"
  ON public.pinterest_connections
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- Policy 5: Service role full access for Inngest background jobs
CREATE POLICY "Service role full access pinterest_connections"
  ON public.pinterest_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE updated_at TIMESTAMP (PINTEREST_CONNECTIONS)
-- ============================================================================

DROP TRIGGER IF EXISTS set_pinterest_connections_updated_at ON public.pinterest_connections;
CREATE TRIGGER set_pinterest_connections_updated_at
  BEFORE UPDATE ON public.pinterest_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- STEP 3: OAUTH_STATE_MAPPING TABLE
-- ============================================================================
-- Short-lived table for OAuth CSRF protection and PKCE code verifier storage.
-- Entries expire after 10 minutes.

CREATE TABLE IF NOT EXISTS public.oauth_state_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  blog_project_id UUID NOT NULL REFERENCES public.blog_projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- ============================================================================
-- CRITICAL: ENABLE ROW LEVEL SECURITY (OAUTH_STATE_MAPPING)
-- ============================================================================

ALTER TABLE public.oauth_state_mapping ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PERFORMANCE INDEXES (OAUTH_STATE_MAPPING)
-- ============================================================================

-- Index on state for fast lookup during OAuth callback
CREATE INDEX IF NOT EXISTS idx_oauth_state_mapping_state
  ON public.oauth_state_mapping(state);

-- ============================================================================
-- RLS POLICIES (OAUTH_STATE_MAPPING)
-- ============================================================================

-- Policy 1: Users can only access their own OAuth state records
CREATE POLICY "Users can access own oauth state mappings"
  ON public.oauth_state_mapping
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Policy 2: Service role full access for Inngest background jobs
CREATE POLICY "Service role full access oauth_state_mapping"
  ON public.oauth_state_mapping
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 4: ADD pinterest_connection_id TO blog_projects
-- ============================================================================

ALTER TABLE public.blog_projects
  ADD COLUMN IF NOT EXISTS pinterest_connection_id UUID
  REFERENCES public.pinterest_connections(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 5: ADD pinterest_pin_url TO pins
-- ============================================================================

ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS pinterest_pin_url TEXT;

-- ============================================================================
-- STEP 6: UPDATE pins STATUS CONSTRAINTS TO ADD 'publishing'
-- ============================================================================

-- Drop existing CHECK constraints
ALTER TABLE public.pins DROP CONSTRAINT IF EXISTS pins_status_check;
ALTER TABLE public.pins DROP CONSTRAINT IF EXISTS pins_previous_status_check;

-- Re-add status CHECK constraint with 'publishing' status
ALTER TABLE public.pins
  ADD CONSTRAINT pins_status_check CHECK (status IN (
    'draft',
    'ready_for_generation',
    'generate_metadata',
    'generating_metadata',
    'metadata_created',
    'ready_to_schedule',
    'publishing',
    'published',
    'error',
    'deleted'
  ));

-- Re-add previous_status CHECK constraint with 'publishing' status
ALTER TABLE public.pins
  ADD CONSTRAINT pins_previous_status_check CHECK (
    previous_status IS NULL OR previous_status IN (
      'draft',
      'ready_for_generation',
      'generate_metadata',
      'generating_metadata',
      'metadata_created',
      'ready_to_schedule',
      'publishing',
      'published',
      'error',
      'deleted'
    )
  );

-- ============================================================================
-- STEP 7: VAULT HELPER RPC FUNCTIONS
-- ============================================================================
-- These SECURITY DEFINER functions allow authenticated users to securely
-- store and retrieve encrypted Pinterest OAuth tokens via Supabase Vault.

-- Function: store_pinterest_tokens
-- Stores access_token and refresh_token in Vault for a connection
CREATE OR REPLACE FUNCTION public.store_pinterest_tokens(
  p_connection_id UUID,
  p_access_token TEXT,
  p_refresh_token TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete any existing secrets for this connection
  DELETE FROM vault.secrets
  WHERE name IN (
    'pinterest_access_token_' || p_connection_id::text,
    'pinterest_refresh_token_' || p_connection_id::text
  );

  -- Insert new access token
  INSERT INTO vault.secrets (name, secret)
  VALUES ('pinterest_access_token_' || p_connection_id::text, p_access_token);

  -- Insert new refresh token
  INSERT INTO vault.secrets (name, secret)
  VALUES ('pinterest_refresh_token_' || p_connection_id::text, p_refresh_token);
END;
$$;

-- Function: get_pinterest_access_token
-- Retrieves decrypted access token from Vault
CREATE OR REPLACE FUNCTION public.get_pinterest_access_token(p_connection_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'pinterest_access_token_' || p_connection_id::text;

  RETURN v_token;
END;
$$;

-- Function: get_pinterest_refresh_token
-- Retrieves decrypted refresh token from Vault
CREATE OR REPLACE FUNCTION public.get_pinterest_refresh_token(p_connection_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'pinterest_refresh_token_' || p_connection_id::text;

  RETURN v_token;
END;
$$;

-- Function: delete_pinterest_tokens
-- Deletes both tokens from Vault for a connection
CREATE OR REPLACE FUNCTION public.delete_pinterest_tokens(p_connection_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM vault.secrets
  WHERE name IN (
    'pinterest_access_token_' || p_connection_id::text,
    'pinterest_refresh_token_' || p_connection_id::text
  );
END;
$$;

-- ============================================================================
-- STEP 8: SERVICE ROLE BYPASS POLICIES FOR PINS AND BOARDS
-- ============================================================================
-- Inngest background jobs need service_role access for publishing workflow

CREATE POLICY "Service role full access pins"
  ON public.pins
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access boards"
  ON public.boards
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
