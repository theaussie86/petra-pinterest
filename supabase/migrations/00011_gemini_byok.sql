-- ============================================================================
-- Gemini BYOK (Bring Your Own Key)
-- ============================================================================
-- Vault RPC functions for per-project Gemini API key storage.
-- Follows the same SECURITY DEFINER pattern as Pinterest tokens (00009).
-- No new tables needed — Vault is the single source of truth.
-- Created: 2026-02-12

-- ============================================================================
-- STEP 1: STORE GEMINI API KEY
-- ============================================================================
-- Deletes any existing key for the project, then creates a new Vault secret.

CREATE OR REPLACE FUNCTION public.store_gemini_api_key(
  p_blog_project_id UUID,
  p_api_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name TEXT := 'gemini_api_key_' || p_blog_project_id::text;
BEGIN
  -- Delete any existing secret for this project
  DELETE FROM vault.secrets
  WHERE name = v_secret_name;

  -- Create new encrypted secret
  PERFORM vault.create_secret(p_api_key, v_secret_name);
END;
$$;

-- ============================================================================
-- STEP 2: GET GEMINI API KEY (decrypted)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_gemini_api_key(p_blog_project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'gemini_api_key_' || p_blog_project_id::text;

  RETURN v_key;
END;
$$;

-- ============================================================================
-- STEP 3: DELETE GEMINI API KEY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_gemini_api_key(p_blog_project_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM vault.secrets
  WHERE name = 'gemini_api_key_' || p_blog_project_id::text;
END;
$$;

-- ============================================================================
-- STEP 4: CHECK IF GEMINI API KEY EXISTS (no decryption)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_gemini_api_key(p_blog_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM vault.secrets
    WHERE name = 'gemini_api_key_' || p_blog_project_id::text
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;
