---
phase: 02-blog-project-management
plan: 05
subsystem: auth
tags: [supabase, postgres, rpc, rls, multi-tenant, profile-creation]

# Dependency graph
requires:
  - phase: 01-02
    provides: profiles table with auto-profile trigger
  - phase: 02-02
    provides: createBlogProject API function
provides:
  - On-demand profile creation for users without existing profiles
  - ensure_profile_exists() RPC function with SECURITY DEFINER
  - ensureProfile() client wrapper in auth.ts
  - Self-healing write operations that create missing profiles
affects: [03-blog-scraping, 04-ai-metadata, 05-pin-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER RPC functions for privileged database operations"
    - "On-demand resource creation pattern for self-healing operations"
    - "Race condition handling with ON CONFLICT DO NOTHING + re-select"

key-files:
  created:
    - supabase/migrations/00003_ensure_profile.sql
  modified:
    - src/lib/auth.ts
    - src/lib/api/blog-projects.ts

key-decisions:
  - "Use SECURITY DEFINER RPC instead of client-side insert to bypass RLS INSERT restrictions"
  - "Apply ensure_profile_exists() in both getUser() and createBlogProject() for comprehensive coverage"
  - "Handle race conditions with ON CONFLICT DO NOTHING pattern for concurrent profile creation"

patterns-established:
  - "RPC pattern: Client calls supabase.rpc() for privileged operations requiring RLS bypass"
  - "Fallback pattern: ensureProfile() creates missing profiles on-demand rather than throwing errors"

# Metrics
duration: 2min
completed: 2026-01-27
---

# Phase 2 Plan 5: Profile Creation Gap Closure Summary

**On-demand profile creation via SECURITY DEFINER RPC function, fixing PGRST116 errors for users whose profiles were not auto-created during signup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-27T16:06:41Z
- **Completed:** 2026-01-27T16:08:26Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created ensure_profile_exists() RPC function with SECURITY DEFINER to bypass RLS restrictions
- Added ensureProfile() wrapper function in auth.ts for client-side usage
- Updated createBlogProject() to use ensureProfile() instead of raw .single() query
- Updated getUser() to use ensureProfile() for proactive profile creation
- Eliminated PGRST116 "0 rows returned" errors when creating blog projects

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ensureProfile() to auth.ts and use it in createBlogProject** - `695c630` (fix)

## Files Created/Modified
- `supabase/migrations/00003_ensure_profile.sql` - SECURITY DEFINER RPC function for on-demand profile creation
- `src/lib/auth.ts` - Added ensureProfile() wrapper and updated getUser() to use it
- `src/lib/api/blog-projects.ts` - Updated createBlogProject() to use ensureProfile() instead of direct profile query

## Decisions Made

**Use SECURITY DEFINER RPC instead of client-side insert:**
- RLS policies on profiles table do not include INSERT policy (only SELECT/UPDATE for authenticated users)
- Original auto-profile trigger uses SECURITY DEFINER to bypass RLS
- Consistent pattern: privileged operations that bypass RLS should use SECURITY DEFINER functions

**Apply ensureProfile() in both getUser() and createBlogProject():**
- getUser() proactively creates profile during auth guard check
- createBlogProject() ensures profile exists before write operation
- Comprehensive coverage eliminates race conditions between profile creation and first write

**Race condition handling with ON CONFLICT DO NOTHING:**
- Multiple concurrent requests might attempt to create the same profile
- ON CONFLICT DO NOTHING allows graceful handling of concurrent insertions
- Re-select after insert ensures tenant_id is always returned

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Blog project creation now works for all users regardless of profile creation timing
- Write operations self-heal missing profiles automatically
- Ready to proceed with Phase 3 (Blog Scraping & Articles)
- All Phase 2 UAT tests should now pass (Tests 2-6 unblocked)

---
*Phase: 02-blog-project-management*
*Completed: 2026-01-27*
