-- Restrict Vault RPC Functions to the Service Role
-- The vault helper functions are SECURITY DEFINER and do not check the caller,
-- so they must only be executable by server-side code. Every caller in the
-- codebase (src/lib/server/*, src/trigger/*, server/lib/vault-helpers.ts,
-- supabase/functions/*) uses the service role client.
-- Created: 2026-09-13
--
-- 00029_pin_werkstatt_agent_role.sql already removed the implicit PUBLIC grant;
-- this removes the explicit anon/authenticated grants. service_role keeps
-- EXECUTE. ensure_profile_exists() and get_dashboard_stats() are untouched:
-- the browser client calls them and they scope by auth.uid().

REVOKE EXECUTE ON FUNCTION public.get_gemini_api_key(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_gemini_api_key(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_gemini_api_key(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_gemini_api_key(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pinterest_access_token(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pinterest_refresh_token(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_pinterest_tokens(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_pinterest_tokens(uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_gemini_api_key(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_gemini_api_key(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_gemini_api_key(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_gemini_api_key(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pinterest_access_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pinterest_refresh_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_pinterest_tokens(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_pinterest_tokens(uuid) TO service_role;
