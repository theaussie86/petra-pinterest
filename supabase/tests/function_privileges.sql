-- Function Privilege Checks
-- Run in the Supabase SQL editor after every migration that adds functions,
-- tables or roles. Every row must show passed = true (failures sort first).
-- Created: 2026-09-13 (epic #74, migration 00029_pin_werkstatt_agent_role.sql)
-- Updated: 2026-10-20 (#127) — the pin_werkstatt_agent role and
-- agent_project_access were dropped (migration 00039); their checks are gone.
-- The agent now works through the MCP server under the user's JWT and RLS.
--
-- Covers:
--   1. No SECURITY DEFINER function in public is executable via PUBLIC
--      (Postgres grants EXECUTE to PUBLIC on every new function by default).
--   2. The roles the app actually uses keep EXECUTE on the functions they call.

WITH secdef AS (
  SELECT p.oid, p.oid::regprocedure::text AS sig, p.proacl
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.prosecdef
),
checks(check_name, passed) AS (
  -- 1. No PUBLIC execute on SECURITY DEFINER functions
  SELECT 'no PUBLIC execute: ' || sig,
         NOT EXISTS (
           SELECT 1 FROM aclexplode(coalesce(proacl, acldefault('f', 'postgres'::regrole)))
           WHERE grantee = 0 AND privilege_type = 'EXECUTE'
         )
  FROM secdef

  UNION ALL
  -- 2. Roles the app relies on keep EXECUTE
  --    service_role: src/lib/server/*, Edge Functions
  SELECT 'service_role can execute: ' || fn,
         has_function_privilege('service_role', fn, 'EXECUTE')
  FROM unnest(ARRAY[
    'public.get_gemini_api_key(uuid)',
    'public.store_gemini_api_key(uuid,text)',
    'public.delete_gemini_api_key(uuid)',
    'public.has_gemini_api_key(uuid)',
    'public.get_pinterest_access_token(uuid)',
    'public.get_pinterest_refresh_token(uuid)',
    'public.store_pinterest_tokens(uuid,text,text)',
    'public.delete_pinterest_tokens(uuid)'
  ]) fn

  UNION ALL
  --    authenticated: browser client (auth bootstrap, dashboard)
  SELECT 'authenticated can execute: ' || fn,
         has_function_privilege('authenticated', fn, 'EXECUTE')
  FROM unnest(ARRAY[
    'public.ensure_profile_exists()',
    'public.get_dashboard_stats()'
  ]) fn

  UNION ALL
  --    Vault helpers are service-role only (00030_restrict_vault_functions.sql):
  --    they do not check the caller, so browser roles must not reach them.
  SELECT rl || ' cannot execute: ' || fn,
         NOT has_function_privilege(rl, fn, 'EXECUTE')
  FROM unnest(ARRAY[
    'public.get_gemini_api_key(uuid)',
    'public.store_gemini_api_key(uuid,text)',
    'public.delete_gemini_api_key(uuid)',
    'public.has_gemini_api_key(uuid)',
    'public.get_pinterest_access_token(uuid)',
    'public.get_pinterest_refresh_token(uuid)',
    'public.store_pinterest_tokens(uuid,text,text)',
    'public.delete_pinterest_tokens(uuid)'
  ]) fn
  CROSS JOIN unnest(ARRAY['anon', 'authenticated']) rl

  UNION ALL
  --    handle_new_user runs as a trigger on auth.users; triggers fire without
  --    EXECUTE on the function, so only its existence is checked.
  SELECT 'trigger on_auth_user_created exists',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
                 AND tgrelid = 'auth.users'::regclass)

  UNION ALL
  -- 3. The retired agent role is gone (migration 00039, #127)
  SELECT 'pin_werkstatt_agent role removed',
         NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pin_werkstatt_agent')

  UNION ALL
  SELECT 'agent_project_access table removed',
         NOT EXISTS (SELECT 1 FROM pg_class
                     WHERE relnamespace = 'public'::regnamespace
                       AND relname = 'agent_project_access')

  UNION ALL
  --    tenant_features (00031): users read own flags, nobody but service_role writes
  SELECT rl || ' ' || priv || ' on tenant_features = ' || expected,
         has_table_privilege(rl, 'public.tenant_features', priv) = expected
  FROM (VALUES
    ('authenticated', 'SELECT', true),
    ('authenticated', 'INSERT', false),
    ('authenticated', 'UPDATE', false),
    ('authenticated', 'DELETE', false),
    ('anon',          'SELECT', false)
  ) AS f(rl, priv, expected)

  UNION ALL
  SELECT 'RLS enabled on ' || relname, relrowsecurity
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname IN ('blog_projects', 'blog_articles',
                    'pin_templates', 'pin_template_revisions', 'tenant_features')

  UNION ALL
  -- The tenant_id trigger stays (every writer); the agent status guard was
  -- dropped with the role (migration 00039).
  SELECT 'trigger exists: set_pin_templates_tenant_id',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_pin_templates_tenant_id'
                 AND tgrelid = 'public.pin_templates'::regclass)

  UNION ALL
  SELECT 'trigger removed: guard_pin_templates_agent_writes',
         NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_pin_templates_agent_writes'
                     AND tgrelid = 'public.pin_templates'::regclass)
)
SELECT check_name, passed
FROM checks
ORDER BY passed, check_name;
