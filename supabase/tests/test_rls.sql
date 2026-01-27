-- RLS Test Suite for Petra Pinterest
-- Run these queries in Supabase SQL Editor to verify RLS is working correctly
-- Created: 2026-01-27

-- ============================================================================
-- Test 1: Verify RLS is enabled on profiles table
-- ============================================================================
-- This query checks if Row Level Security is enabled on the profiles table.
-- Expected result: rowsecurity = true

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'profiles';

-- ============================================================================
-- Test 2: Verify RLS policies exist
-- ============================================================================
-- This query lists all policies on the profiles table.
-- Expected result: At least 2 policies (SELECT, UPDATE)

SELECT
  pol.polname AS policy_name,
  pol.polcmd AS command_type,
  pol.polroles::regrole[] AS applies_to_roles
FROM pg_policy pol
JOIN pg_class cls ON pol.polrelid = cls.oid
WHERE cls.relname = 'profiles';

-- ============================================================================
-- Test 3: Verify tenant_id index exists for performance
-- ============================================================================
-- This query checks if the performance index on tenant_id exists.
-- Expected result: idx_profiles_tenant_id exists

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'profiles' AND indexname LIKE '%tenant_id%';

-- ============================================================================
-- Test 4: Verify triggers are installed
-- ============================================================================
-- This query lists all triggers on the profiles and auth.users tables.
-- Expected results:
-- - on_auth_user_created trigger on auth.users
-- - set_profiles_updated_at trigger on profiles

SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation AS fires_on,
  action_timing AS timing
FROM information_schema.triggers
WHERE event_object_table IN ('profiles', 'users')
  AND trigger_schema IN ('public', 'auth')
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- Test 5: Verify foreign key constraint exists
-- ============================================================================
-- This query checks if profiles.id references auth.users(id).
-- Expected result: Foreign key constraint exists

SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'profiles';

-- ============================================================================
-- MANUAL TESTING INSTRUCTIONS
-- ============================================================================
-- These tests require manual execution in Supabase Dashboard:
--
-- Test 6: Unauthenticated user cannot access profiles
-- 1. In Supabase SQL Editor, ensure you're using the anon key (not service_role)
-- 2. Run: SELECT * FROM profiles LIMIT 1;
-- 3. Expected: Empty result or permission denied
--
-- Test 7: Authenticated user can only see their own profile
-- 1. Create a test user via Supabase Auth UI
-- 2. Note their UUID (user_id)
-- 3. In SQL Editor with authenticated session, run:
--    SELECT * FROM profiles WHERE id = auth.uid();
-- 4. Expected: Should return exactly 1 row (your profile)
-- 5. Try to access another user's profile:
--    SELECT * FROM profiles WHERE id != auth.uid();
-- 6. Expected: Empty result (RLS blocks access)
--
-- Test 8: Profile auto-creation on signup
-- 1. Create a new user via Supabase Auth
-- 2. Immediately query: SELECT * FROM profiles WHERE id = '[new-user-id]';
-- 3. Expected: Profile row exists with tenant_id auto-generated
--
-- Test 9: Updated_at timestamp auto-updates
-- 1. Update your profile: UPDATE profiles SET display_name = 'Test' WHERE id = auth.uid();
-- 2. Query: SELECT updated_at, created_at FROM profiles WHERE id = auth.uid();
-- 3. Expected: updated_at > created_at

-- ============================================================================
-- SECURITY VERIFICATION CHECKLIST
-- ============================================================================
-- Before going to production, verify:
-- [ ] RLS is enabled on profiles table (Test 1)
-- [ ] RLS policies exist and are active (Test 2)
-- [ ] Unauthenticated users cannot access any data (Test 6)
-- [ ] Authenticated users can only access their own data (Test 7)
-- [ ] Cross-tenant data access is blocked (Test 7)
-- [ ] Profile auto-creation works on signup (Test 8)
-- [ ] Performance index exists on tenant_id (Test 3)
