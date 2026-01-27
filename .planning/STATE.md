# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Users can efficiently schedule Pinterest pins for multiple blogs from a single calendar view with visual pin previews.
**Current focus:** Phase 2 complete (gap closure done) — ready for Phase 3

## Current Position

Phase: 2 of 7 (Blog Project Management) — COMPLETE
Plan: 6 of 6 in current phase
Status: Complete ✓ (all gaps closed)
Last activity: 2026-01-27 — Completed 02-06 (post-delete navigation fix)

Progress: [████░░░░░░] 33%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: ~4.5min
- Total execution time: ~0.90 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Security | 5 | ~37min | ~7min |
| 2. Blog Project Management | 6 | ~15.5min | ~2.6min |

**Recent Trend:**
- Last 5 plans: 02-06 (1min), 02-05 (2min), 02-04 (2min), 02-03 (5min), 02-02 (2min)
- Trend: Exceptional velocity on Phase 2 (sub-3min average)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- TanStack Router SPA over TanStack Start — Start had Vite 7 dependency conflicts; Router SPA via create-tsrouter-app works with same file-based routing
- Path alias @/ instead of ~/ — Matches official template convention
- Keep n8n for Pinterest API — Pinterest OAuth complexity, don't block v1
- Keep granular pin statuses — Preserve existing workflow
- Blog scraping in-app — Less n8n complexity, better user control
- AI metadata in-app — Direct integration, faster iteration

**From 01-02 (Database Schema):**
- Enabled RLS immediately on profiles table before any production data — Critical security requirement
- Used gen_random_uuid() for tenant_id generation — Automatic tenant assignment
- Applied performance index on tenant_id — Multi-tenant query optimization
- Created auto-profile trigger with SECURITY DEFINER — System-level profile creation bypasses RLS

**From 01-03 (Google OAuth):**
- Client-side authentication using Supabase JS client — Matches TanStack Router SPA architecture (not SSR)
- Navigate to / instead of /dashboard after OAuth — Dashboard route created in 01-04
- Auto-generated route tree with TanStack Router CLI — Required for type-safe navigation

**From 01-04 (Protected Dashboard):**
- Use TanStack Router beforeLoad for auth guard — Pattern matches SPA architecture
- Pass user context via route context — beforeLoad returns user data, child routes access via useRouteContext
- _authed layout pattern — All protected routes go under /_authed/* with automatic redirect
- Simple dropdown with state toggle — Avoided headless UI library for simple menu

**From 01-05 (Auth Guard Redirect Fix):**
- Use getAuthUser() for auth guard gate — No profile table dependency
- getUser() returns fallback values (not null) when profile missing — Handles race condition with profile trigger
- Auth guard makes 2 calls (auth check + profile query) — Correctness over optimization
- Graceful fallback pattern for race conditions with database triggers — display_name derived from email when profile doesn't exist yet

**From 02-01 (Database & Foundation Setup):**
- Remove foreign key from blog_projects.tenant_id to profiles(tenant_id) — profiles.tenant_id lacks unique constraint; RLS policies enforce tenant relationship
- Install Supabase CLI for migrations instead of MCP/JS client — Standard tool for migration management
- Use 30-second staleTime for TanStack Query default — Balance between fresh data and reducing redundant requests

**From 02-02 (Blog Projects Data Layer):**
- Remove BlogProjectUpdate from hooks import — Type only used in API layer, satisfies TypeScript unused import check
- Optimistic update only on create mutation — Update/delete don't benefit as much from optimistic UX, keeps code simpler
- Graceful degradation in checkProjectRelatedData — blog_articles and pins tables don't exist yet, returns {0,0} when tables missing

**From 02-03 (Blog Projects UI):**
- Create and edit share same ProjectDialog component with mode detection via project prop — Reduces duplication, single validation schema, consistent UX
- Create mode shows only name + blog_url; edit mode shows all 4 fields — Minimal creation per CONTEXT.md, progressive disclosure
- Manual RSS URL validation in onSubmit instead of Zod schema complexity — Zod's .optional().or(z.literal('')) creates TypeScript inference issues with react-hook-form
- Phase 2 stats hard-coded to 0 with structure ready for future data — Articles and pins don't exist yet, UI demonstrates final design

**From 02-04 (Project Detail Page):**
- Use TanStack Router file-based routing for dynamic project ID parameter — Consistent with existing route patterns, type-safe params access
- Handle delete navigation override with onSuccess callback — Need to navigate to dashboard after delete, override default mutation behavior
- Include placeholder sections for Articles and Pins — Communicate future functionality, set user expectations

**From 02-05 (Profile Creation Gap Closure):**
- Use SECURITY DEFINER RPC instead of client-side insert for privileged operations — RLS policies on profiles don't include INSERT policy, consistent with auto-profile trigger pattern
- Apply ensureProfile() in both getUser() and createBlogProject() — Comprehensive coverage eliminates race conditions, proactive profile creation
- Handle race conditions with ON CONFLICT DO NOTHING + re-select — Allows graceful handling of concurrent profile creation attempts

**From 02-06 (Post-Delete Navigation Fix):**
- Navigation is a UI concern, not a data layer concern — Optional callback added to DeleteDialog component, not mutation hook
- onDeleted callback is optional and backward-compatible — Dashboard doesn't need it (stays on dashboard), detail page uses it (navigates to dashboard)

### Pending Todos

1 pending todo(s):
- **Cleanup AIRTABLE_PAT from ~/.zshrc** (tooling) — Remove after Airtable MCP no longer needed

### Blockers/Concerns

**From Research:**
- ✅ Phase 1: Multi-tenant RLS is CRITICAL — ADDRESSED in 01-02 (RLS enabled on profiles table)
- Phase 6: Calendar performance with 1000+ pins needs testing (virtualization may be required)
- Phase 7: Airtable migration is high complexity — budget 2-3x expected time for formula/linked record conversion

**From 01-02:**
- Run test_rls.sql verification queries after Supabase connection established
- Complete security checklist before production launch

## Session Continuity

Last session: 2026-01-27
Stopped at: Completed 02-06-PLAN.md (post-delete navigation fix)
Resume file: None
Next: Phase 2 fully complete — ready for Phase 3 (Blog Scraping & Articles)

Config:
{
  "mode": "yolo",
  "depth": "standard",
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "balanced",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true
  }
}
