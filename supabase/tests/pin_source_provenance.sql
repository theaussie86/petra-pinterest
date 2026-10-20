-- Provenance columns for Connected Agents (migration 00037, issue #122)
-- Run in the Supabase SQL Editor to verify the source / oauth_client_id columns
-- exist with the right defaults and constraint on both pins and pin_templates.

-- ============================================================================
-- Test 1: Both provenance columns exist on pins and pin_templates
-- ============================================================================
-- Expected: four rows — source + oauth_client_id on each table.

SELECT table_name, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('pins', 'pin_templates')
  AND column_name IN ('source', 'oauth_client_id')
ORDER BY table_name, column_name;

-- ============================================================================
-- Test 2: `source` defaults to 'ui' and is NOT NULL on both tables
-- ============================================================================
-- Expected: column_default = '''ui''::text', is_nullable = 'NO' for both.

SELECT table_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('pins', 'pin_templates')
  AND column_name = 'source'
ORDER BY table_name;

-- ============================================================================
-- Test 3: `source` CHECK constraint only allows 'ui' and 'mcp'
-- ============================================================================
-- Expected: one CHECK clause per table mentioning both allowed values.

SELECT rel.relname AS table_name, con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname IN ('pins', 'pin_templates')
  AND con.contype = 'c'
  AND pg_get_constraintdef(con.oid) ILIKE '%source%'
ORDER BY rel.relname;

-- ============================================================================
-- Test 4: oauth_client_id is nullable on both tables
-- ============================================================================
-- Expected: is_nullable = 'YES' for both rows.

SELECT table_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('pins', 'pin_templates')
  AND column_name = 'oauth_client_id'
ORDER BY table_name;

-- ============================================================================
-- Test 5: A rejected `source` value fails the CHECK (run inside a rollback)
-- ============================================================================
-- Expected: the UPDATE raises a check_violation; the transaction rolls back so
-- no data changes. Run manually and confirm the error appears.
--
-- BEGIN;
--   UPDATE public.pins SET source = 'bogus'
--   WHERE id = (SELECT id FROM public.pins LIMIT 1);
-- ROLLBACK;
