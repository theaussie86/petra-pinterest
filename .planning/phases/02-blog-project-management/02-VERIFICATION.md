---
phase: 02-blog-project-management
verified: 2026-01-27T16:37:23Z
status: passed
score: 11/11 must-haves verified
re_verification:
  previous_status: passed
  previous_verified: 2026-01-27T16:13:00Z
  previous_score: 8/8
  gaps_closed:
    - "After confirming delete on the project detail page, user is automatically navigated to /dashboard"
    - "Deleting a project from the dashboard does NOT navigate away (user stays on dashboard)"
    - "Delete still shows success toast and removes project from cache"
  gaps_remaining: []
  regressions: []
  new_must_haves:
    - "DeleteDialog has optional onDeleted callback prop"
    - "Project detail page passes navigation callback to DeleteDialog"
    - "Dashboard DeleteDialog usage unchanged (no onDeleted prop)"
---

# Phase 2: Blog Project Management — Re-Verification Report

**Phase Goal:** Users can create and manage multiple blog projects with dashboard overview

**Verified:** 2026-01-27T16:37:23Z

**Status:** PASSED

**Re-verification:** Yes — after gap closure plan 02-06 (post-delete navigation fix)

## Executive Summary

**Re-verification after gap closure plan 02-06** which fixed post-delete navigation behavior.

Previous verification (2026-01-27T16:13:00Z) passed after gap closure plan 02-05 (on-demand profile creation). UAT identified one remaining issue: Test 5 failed because deleting a project from the detail page did not navigate back to the dashboard, leaving the user on a stale page.

**Gap closure plan 02-06** (commit 3802abe) fixed the navigation issue by:
1. Adding optional `onDeleted?: () => void` callback prop to DeleteDialog
2. Wiring navigation in project detail page via `useNavigate()` 
3. Maintaining backward compatibility — dashboard DeleteDialog unchanged

**Result:** All 11 must-haves now verified (5 original Phase 2 + 3 from plan 02-05 + 3 from plan 02-06). The phase goal is fully achieved. All CRUD operations work correctly with proper navigation behavior.

## Re-Verification Context

**Previous verification status:** PASSED (after plan 02-05)
**Previous score:** 8/8 must-haves
**UAT Test 5 failure:** Deleting project from detail page left user on stale page
**Gap closure:** Plan 02-06 executed, commit 3802abe
**This verification:** Confirms gap closure + validates no regressions

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create blog project with name, URL, and scraping settings | ✓ VERIFIED | ProjectDialog component with React Hook Form + Zod validation submits via useCreateBlogProject hook. createBlogProject() calls ensureProfile() (line 33) then inserts with tenant_id. Works for all users. No changes from plan 02-06. |
| 2 | User can view list of all their blog projects | ✓ VERIFIED | Dashboard route uses useBlogProjects hook → getBlogProjects API (Supabase SELECT with RLS). Projects render in responsive CSS Grid. Empty state when no projects. No changes from plan 02-06. |
| 3 | User can edit blog project details | ✓ VERIFIED | ProjectCard edit button → ProjectDialog edit mode. All 4 fields editable. useUpdateBlogProject → updateBlogProject API. Cache invalidation on success. No changes from plan 02-06. |
| 4 | User can delete blog projects | ✓ VERIFIED | DeleteDialog → useDeleteBlogProject → deleteBlogProject API. Cache invalidation + toast. **NEW: Detail page navigates to dashboard after delete via onDeleted callback (line 195 of $id.tsx). Dashboard stays in place (no onDeleted passed, lines 104-111 of dashboard.tsx).** |
| 5 | Dashboard displays overview statistics | ✓ VERIFIED | StatsBar component renders 3 stat cards (Scheduled, Published, Pending). Hard-coded to 0 for Phase 2. Structure ready for real data. No changes from plan 02-06. |
| 6 | ensureProfile() creates profiles on-demand for missing profiles | ✓ VERIFIED | ensureProfile() function in auth.ts (lines 45-50). Calls supabase.rpc('ensure_profile_exists'). Returns { tenant_id }. Error handling for RPC failures. Used in createBlogProject (line 33) and getUser (line 85). No changes from plan 02-06. |
| 7 | ensure_profile_exists() RPC function handles race conditions | ✓ VERIFIED | Migration 00003_ensure_profile.sql defines RPC with SECURITY DEFINER. SELECT → INSERT (ON CONFLICT DO NOTHING) → SELECT pattern handles concurrent requests. Returns TABLE(tenant_id UUID). No changes from plan 02-06. |
| 8 | All write operations work for users without existing profiles | ✓ VERIFIED | createBlogProject() uses ensureProfile() which self-heals missing profiles. getUser() also uses ensureProfile(), creating profiles proactively during auth guard check. No changes from plan 02-06. |
| 9 | After confirming delete on the project detail page, user is automatically navigated to /dashboard | ✓ VERIFIED | Project detail page ($id.tsx) line 19: imports useNavigate. Line 195: passes `onDeleted={() => navigate({ to: '/dashboard' })}` to DeleteDialog. DeleteDialog line 29 calls `onDeleted?.()` after successful mutation. Navigation happens after delete completes. |
| 10 | Deleting a project from the dashboard does NOT navigate away (user stays on dashboard) | ✓ VERIFIED | Dashboard DeleteDialog usage (lines 104-111 of dashboard.tsx) only passes `open`, `onOpenChange`, and `project` props. No `onDeleted` prop passed. User remains on dashboard after deletion. Backward compatible with plan 02-06 changes. |
| 11 | Delete still shows success toast and removes project from cache | ✓ VERIFIED | useDeleteBlogProject hook (lines 92-105 of use-blog-projects.ts) handles onSuccess with toast.success('Project deleted') and queryClient.invalidateQueries. No changes from plan 02-06 — mutation hook unchanged. Toast + cache invalidation work for both dashboard and detail page deletions. |

**Score:** 11/11 truths verified (5 original + 3 from plan 02-05 + 3 from plan 02-06)

### Required Artifacts

#### Original Phase 2 Artifacts (No Regressions)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/routes/_authed/dashboard.tsx` | Main dashboard with project grid, stats bar, create button | ✓ VERIFIED | 116 lines. No changes from plan 02-06. DeleteDialog usage unchanged (lines 104-111). All original functionality intact. |
| `src/components/projects/project-dialog.tsx` | Create/Edit modal with React Hook Form + Zod validation | ✓ VERIFIED | 212 lines. No changes from plan 02-06. Form validation unchanged. |
| `src/components/dashboard/stats-bar.tsx` | Global statistics summary bar | ✓ VERIFIED | 52 lines. No changes from plan 02-06. Hard-coded 0s with comment intact. |
| `src/components/dashboard/project-card.tsx` | Individual project card | ✓ VERIFIED | 92 lines. No changes from plan 02-06. |
| `src/components/dashboard/empty-state.tsx` | Empty state with CTA | ✓ VERIFIED | 24 lines. No changes from plan 02-06. |
| `src/types/blog-projects.ts` | TypeScript types | ✓ VERIFIED | 27 lines. No changes from plan 02-06. |
| `src/lib/hooks/use-blog-projects.ts` | TanStack Query hooks | ✓ VERIFIED | 106 lines. **No changes from plan 02-06 — mutation hook unchanged (plan correctly kept navigation in UI layer).** Optimistic updates + cache invalidation intact. |
| `supabase/migrations/00002_blog_projects.sql` | Database schema with RLS | ✓ VERIFIED | 102 lines. No changes from plan 02-06. |

#### Gap Closure 02-05 Artifacts (No Regressions)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/auth.ts` | ensureProfile() function with RPC call | ✓ VERIFIED | 126 lines. No changes from plan 02-06. ensureProfile() at lines 45-50. getUser() uses ensureProfile() at line 85. |
| `src/lib/api/blog-projects.ts` | createBlogProject() using ensureProfile() | ✓ VERIFIED | 94 lines. No changes from plan 02-06. Import ensureProfile on line 2. Line 33 calls ensureProfile(). |
| `supabase/migrations/00003_ensure_profile.sql` | SECURITY DEFINER RPC function | ✓ VERIFIED | 40 lines. No changes from plan 02-06. |

#### Gap Closure 02-06 Artifacts (New)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/projects/delete-dialog.tsx` | Optional onDeleted callback prop, called after successful deletion | ✓ VERIFIED | 71 lines (+2 from previous). Line 17: `onDeleted?: () => void` added to interface. Line 20: destructures onDeleted from props. Line 29: calls `onDeleted?.()` after successful mutateAsync. Call order: `await mutateAsync` → `onOpenChange(false)` → `onDeleted?.()`. No changes to mutation hook call or error handling. |
| `src/routes/_authed/projects/$id.tsx` | Navigation callback passed to DeleteDialog | ✓ VERIFIED | 201 lines (+2 from previous). Line 1: imports `useNavigate` from @tanstack/react-router. Line 19: calls `const navigate = useNavigate()`. Line 195: passes `onDeleted={() => navigate({ to: '/dashboard' })}` to DeleteDialog. Wired correctly. |

**All artifacts exist, substantive (not stubs), and properly wired. No regressions from gap closure 02-06.**

### Key Link Verification

#### Original Links (No Regressions)

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Dashboard → Data Layer | src/lib/hooks/use-blog-projects.ts | useBlogProjects hook | ✓ WIRED | No changes. Dashboard line 20, destructures data/isLoading/error/refetch. |
| Project Dialog → Mutations | src/lib/hooks/use-blog-projects.ts | useCreateBlogProject, useUpdateBlogProject | ✓ WIRED | No changes. Line 22 imports, lines 103/111 call mutations. |
| Delete Dialog → Mutation | src/lib/hooks/use-blog-projects.ts | useDeleteBlogProject | ✓ WIRED | No changes. Line 10 import, line 27 calls mutation (updated line number after onDeleted addition). |
| Hooks → API Layer | src/lib/api/blog-projects.ts | API functions as queryFn/mutationFn | ✓ WIRED | No changes. All 5 API functions used in hooks. |
| API Layer → Supabase | src/lib/supabase.ts | supabase client | ✓ WIRED | No changes. All functions use supabase.from('blog_projects'). |
| API Layer → Types | src/types/blog-projects.ts | BlogProject types | ✓ WIRED | No changes. Line 2 imports all types. |
| Project Card → Detail Page | src/routes/_authed/projects/$id.tsx | TanStack Router Link | ✓ WIRED | No changes. Line 22 Link component. |
| App Root → TanStack Query | @tanstack/react-query | QueryClientProvider | ✓ WIRED | No changes. main.tsx wraps app. |
| Root Route → Toast System | sonner | Toaster component | ✓ WIRED | No changes. __root.tsx renders Toaster. |

#### Gap Closure 02-05 Links (No Regressions)

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| createBlogProject → ensureProfile | src/lib/auth.ts | ensureProfile() call | ✓ WIRED | No changes. blog-projects.ts line 2 imports ensureProfile. Line 33 calls it. |
| getUser → ensureProfile | src/lib/auth.ts | ensureProfile() call | ✓ WIRED | No changes. auth.ts line 85 calls ensureProfile. |
| ensureProfile → RPC Function | supabase | supabase.rpc() call | ✓ WIRED | No changes. auth.ts line 46 calls RPC. |
| RPC Function → Profiles Table | public.profiles | INSERT with ON CONFLICT | ✓ WIRED | No changes. Migration 00003 handles race conditions. |

#### New Gap Closure 02-06 Links

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| DeleteDialog → Parent Component | onDeleted callback | Optional callback prop | ✓ WIRED | delete-dialog.tsx line 17: interface defines `onDeleted?: () => void`. Line 20: destructures from props. Line 29: calls `onDeleted?.()` after successful mutation. Pattern: `await mutateAsync` → `onOpenChange(false)` → `onDeleted?.()`. |
| Project Detail Page → Dashboard | TanStack Router navigate | useNavigate hook | ✓ WIRED | $id.tsx line 1: imports useNavigate. Line 19: calls `const navigate = useNavigate()`. Line 195: passes `onDeleted={() => navigate({ to: '/dashboard' })}` to DeleteDialog. Navigation triggered after deletion succeeds. |
| Dashboard → DeleteDialog | No onDeleted prop | Backward compatibility | ✓ WIRED | dashboard.tsx lines 104-111: DeleteDialog usage only passes `open`, `onOpenChange`, `project`. No `onDeleted` prop. Optional callback pattern ensures no regression — dashboard stays in place after deletion. |

**All critical links verified. New links properly integrated without breaking existing wiring.**

### Requirements Coverage

Requirements from ROADMAP.md mapped to Phase 2:

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| BLOG-01: Create blog project with name, URL, scraping settings | ✓ SATISFIED | ProjectDialog → useCreateBlogProject → createBlogProject → ensureProfile() → insert with tenant_id. Works for all users including pre-migration users. No changes from plan 02-06. |
| BLOG-02: View list of all blog projects | ✓ SATISFIED | Dashboard → useBlogProjects → getBlogProjects. No changes from plan 02-06. |
| BLOG-03: Edit blog project details | ✓ SATISFIED | ProjectDialog edit mode → useUpdateBlogProject → updateBlogProject. No changes from plan 02-06. |
| BLOG-04: Delete blog projects | ✓ SATISFIED | DeleteDialog → useDeleteBlogProject → deleteBlogProject. **Enhanced with context-aware navigation: detail page navigates to dashboard, dashboard stays in place. Gap closure plan 02-06 completed.** |
| BLOG-05: Scraping frequency setting | ✓ SATISFIED | scraping_frequency field in DB + dialog + badge. No changes from plan 02-06. |
| DASH-01: Dashboard overview statistics | ✓ SATISFIED | StatsBar with 3 stat cards. Hard-coded to 0 for Phase 2. No changes from plan 02-06. |

**All 6 requirements satisfied. BLOG-04 now has complete implementation with proper post-delete navigation.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/components/dashboard/stats-bar.tsx | 5-26 | Hard-coded zero counts | ℹ️ INFO | Expected for Phase 2. Comment explains "articles/pins don't exist yet". Not a blocker. |
| src/components/dashboard/project-card.tsx | 14-19 | Hard-coded zero stats | ℹ️ INFO | Expected for Phase 2. Same rationale. Not a blocker. |
| src/components/dashboard/stats-bar.tsx | 34-36 | Empty onClick handler | ℹ️ INFO | Comment states "Navigation wired in future phases". Not a blocker. |

**No TODO, FIXME, XXX, or HACK patterns in modified files (verified via grep).**

**No blocking anti-patterns. All INFO items are intentional Phase 2 placeholders with explanatory comments. No new anti-patterns introduced by gap closure 02-06.**

### Gap Closure 02-06 Verification

**Previous gap (from UAT Test 5):**
> "Deleting a project from the detail page (/projects/:id) leaves the user on a stale page showing 'Project not found' instead of navigating back to the dashboard."

**Fix implemented (from 02-06-PLAN.md):**
1. ✓ Added optional `onDeleted?: () => void` callback to DeleteDialog
2. ✓ Wired `useNavigate()` in project detail page
3. ✓ Passed navigation callback to DeleteDialog: `onDeleted={() => navigate({ to: '/dashboard' })}`
4. ✓ Maintained backward compatibility — dashboard DeleteDialog unchanged

**Verification of fix:**

**Level 1: Existence**
- ✓ `onDeleted?: () => void` prop exists in DeleteDialog interface (line 17)
- ✓ `onDeleted?.()` call exists in handleDelete (line 29)
- ✓ `useNavigate` imported in $id.tsx (line 1)
- ✓ Navigation callback passed to DeleteDialog (line 195)

**Level 2: Substantive**
- ✓ Callback prop properly typed as optional (TypeScript compilation clean)
- ✓ Call order correct: `await mutateAsync` → `onOpenChange(false)` → `onDeleted?.()` (lines 27-29)
- ✓ Navigation callback uses correct TanStack Router syntax: `navigate({ to: '/dashboard' })`
- ✓ Dashboard usage unchanged (no onDeleted prop passed, lines 104-111)
- ✓ No stub patterns (no TODO, empty implementations, or placeholders)

**Level 3: Wired**
- ✓ DeleteDialog callback invoked after successful deletion (line 29 inside try block)
- ✓ Project detail page navigation callback wired (line 195)
- ✓ Dashboard DeleteDialog backward compatible (no onDeleted prop)
- ✓ Mutation hook unchanged (toast + cache invalidation still work)
- ✓ Build succeeds with zero TypeScript errors

**Backward compatibility:**
- ✓ Optional callback pattern (`onDeleted?: () => void`) ensures no breaking changes
- ✓ Dashboard DeleteDialog works without passing onDeleted (verified lines 104-111)
- ✓ Mutation hook logic unchanged (navigation separated from data operations)

**Fix status:** COMPLETE. All planned changes implemented and wired correctly. No regressions.

### Build Verification

```bash
npm run build
# ✓ PASSED — built in 2.05s
# Output: 11 chunks, main bundle 505.75 kB (gzip: 149.67 kB)
# Warning: chunk size > 500kB (expected, not a blocker)
# No TypeScript errors
```

**TypeScript compilation clean. Production build succeeds. No errors.**

### Commit Verification

```bash
git log --oneline | head -5
# 37d2a54 docs(02-06): complete post-delete navigation fix plan
# 3802abe feat(02-06): add post-delete navigation from project detail page  ← GAP CLOSURE COMMIT
# 412c73f docs(02): diagnose delete redirect gap and plan fix (02-06)
# 28153a1 docs(02): create gap closure plan for post-delete navigation
# 0b682df test(02): complete UAT - 4 passed, 1 issue
```

**Gap closure commit 3802abe:**
- Added optional `onDeleted` callback to DeleteDialog
- Wired `useNavigate` in project detail page
- Passed navigation callback to DeleteDialog
- 2 files changed: +4 insertions, -1 deletions
- Clean, minimal change following separation of concerns

**Commit message clearly documents change purpose and Co-Authored-By attribution.**

## Human Verification Required

The following tests require manual execution to fully verify goal achievement. These are the **updated tests from the original verification**, with Test 5 now expected to pass.

### 1. Create Project Flow
**Test:** 
1. Visit /dashboard as authenticated user
2. Click "Create Project" button
3. Enter project name "Test Blog" and URL "https://test.com"
4. Click "Create"

**Expected:**
- Dialog closes
- Toast notification "Project created" appears (top-right, green)
- New project card appears in grid immediately (optimistic update)
- Card shows project name "Test Blog" and URL "https://test.com"
- Card stats show 0 articles, 0 scheduled, 0 published

**Why human:** Optimistic update timing, toast appearance, and UI responsiveness.

### 2. Edit Project Flow
**Test:**
1. From dashboard, click Pencil (edit) icon on a project card
2. Modify project name, add RSS URL "https://test.com/feed", change scraping frequency to "Daily"
3. Click "Update"

**Expected:**
- Dialog closes
- Toast notification "Project updated" appears
- Project card reflects new name immediately
- Detail page shows RSS URL and "Daily" badge

**Why human:** Multi-step interaction, cache update timing.

### 3. Delete Project from Dashboard
**Test:**
1. From dashboard, click Trash (delete) icon on a project card
2. Confirm deletion in dialog

**Expected:**
- Dialog closes
- Toast notification "Project deleted" appears
- Project card disappears from grid
- **User remains on dashboard (no navigation)**
- If last project deleted, empty state appears

**Why human:** Deletion confirmation flow and grid update timing. **Updated to verify user stays on dashboard.**

### 4. Delete Project from Detail Page (Gap Closure 02-06)
**Test:**
1. From dashboard, click on a project card to navigate to detail page (/projects/:id)
2. Click "Delete Project" button
3. Confirm deletion in dialog

**Expected:**
- Dialog closes
- Toast notification "Project deleted" appears
- **User is automatically navigated back to /dashboard**
- Project no longer appears in dashboard project grid
- No "Project not found" page shown

**Why human:** Multi-step navigation flow. **This is the new test for gap closure 02-06 — previously failed, should now pass.**

### 5. Project Detail Page Navigation
**Test:**
1. From dashboard, click anywhere on a project card (not edit/delete buttons)
2. Verify detail page loads at /projects/:id
3. Click "Back to Dashboard"

**Expected:**
- Detail page shows project metadata
- "Articles" and "Pins" placeholder sections visible
- Back navigation returns to dashboard

**Why human:** Full-page navigation and layout rendering.

### 6. Empty State Experience
**Test:**
1. Delete all projects (or use fresh account)
2. View dashboard

**Expected:**
- Stats bar shows 0/0/0
- Empty state with "Create your first blog" button
- No project grid visible
- Clicking CTA opens create dialog

**Why human:** Empty state appearance and CTA interaction.

### 7. Responsive Layout
**Test:**
1. View dashboard on desktop (>1024px)
2. Resize to tablet (768-1024px)
3. Resize to mobile (<768px)

**Expected:**
- Desktop: 3-column project grid
- Tablet: 2-column project grid
- Mobile: 1-column project grid
- Stats bar adjusts from 3-column to stacked

**Why human:** Responsive breakpoints and visual layout.

### 8. Form Validation
**Test:**
1. Open create dialog
2. Leave name empty, enter invalid URL "not-a-url"
3. Click "Create"

**Expected:**
- Red error message below name field: "Name is required"
- Red error message below URL field: "Must be a valid URL"
- Form does not submit

**Why human:** Inline validation appearance.

### 9. Pre-Migration User Project Creation (Gap Closure 02-05)
**Test:**
1. **Simulate pre-migration user:** Manually DELETE your profile row from profiles table via Supabase Studio SQL editor:
   ```sql
   DELETE FROM public.profiles WHERE id = auth.uid();
   ```
2. WITHOUT signing out, immediately try to create a new project:
   - Name: "Gap Test Project"
   - URL: "https://gap-test.com"
3. Click "Create"

**Expected:**
- **Success toast appears** (NOT error toast)
- Project card appears on dashboard
- Check profiles table — **your profile row should now exist** (auto-created)
- Project has correct tenant_id matching the newly created profile

**Why human:** This tests the exact edge case that caused UAT failure. Cannot be verified programmatically without database manipulation and multi-step observation.

**Critical:** This test verifies the fix from plan 02-05 works for users without profiles.

## Result

**Status:** PASSED (Re-verification after gap closure 02-06)

**Confidence:** HIGH

- All original code structures intact (no regressions from plan 02-06)
- Gap closure 02-06 implementation complete and wired correctly
- Gap closure 02-05 implementation still functioning (no regressions)
- TypeScript compiles cleanly
- Production build succeeds
- All 11 must-haves verified (5 original + 3 from plan 02-05 + 3 from plan 02-06)
- No blocking anti-patterns
- Human verification test suite updated with new Test 4 for post-delete navigation

**Blockers for next phase:** NONE

**Gap closure 02-06 effectiveness:**
- ✓ Project detail page navigates to /dashboard after successful deletion
- ✓ Dashboard stays in place after deletion (backward compatible)
- ✓ Toast and cache invalidation still work for both contexts
- ✓ Navigation callback pattern clean and reusable
- ✓ Separation of concerns maintained (navigation in UI, not data layer)

**Recommendations:**

1. **Run UAT Test Suite Again:** Execute all 9 UAT tests (updated). Test 4 (delete from detail page) should now pass. All tests expected to pass.

2. **Verify Navigation Behavior:** Manually test both deletion contexts:
   - Delete from dashboard → user stays on dashboard
   - Delete from detail page → user navigates to dashboard

3. **Phase 2 Complete:** With both gap closures verified, Phase 2 is fully complete and ready for Phase 3 (Blog Scraping & Articles).

**Phase goal achieved:** Users CAN create and manage multiple blog projects with dashboard overview. All CRUD operations work correctly with proper context-aware navigation. All success criteria met through verified implementation. Both gap closures successful with no regressions.

---

**Verified:** 2026-01-27T16:37:23Z  
**Verifier:** Claude (gsd-verifier)  
**Verification Method:** Re-verification after gap closure 02-06 — three-level artifact verification (existence, substance, wiring) + regression testing + gap closure validation  
**Previous Verification:** 2026-01-27T16:13:00Z (after plan 02-05)  
**Gap Closure Plan:** 02-06-PLAN.md (executed, commit 3802abe)  
**Changes from Previous:** +3 must-haves (post-delete navigation), +2 artifacts (delete-dialog.tsx, $id.tsx modified), +3 key links (onDeleted callback wiring), Test 4 updated
