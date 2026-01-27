# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Users can efficiently schedule Pinterest pins for multiple blogs from a single calendar view with visual pin previews.
**Current focus:** Phase 2 complete (gap closure done) — ready for Phase 3

## Current Position

Phase: 3 of 7 (Blog Scraping & Articles) — IN PROGRESS
Plan: 4 of 4 in current phase
Status: Phase complete (plan 03-04 complete)
Last activity: 2026-01-27 — Completed 03-04 (article detail page)

Progress: [████░░░░░░] 42%

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: ~3.8min
- Total execution time: ~0.97 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Security | 5 | ~37min | ~7min |
| 2. Blog Project Management | 6 | ~15.5min | ~2.6min |
| 3. Blog Scraping & Articles | 4 | ~7.5min | ~1.9min |

**Recent Trend:**
- Last 5 plans: 03-04 (2min), 03-02 (1.5min), 03-01 (2min), 02-06 (1min), 02-05 (2min)
- Trend: Exceptional velocity maintained (sub-2min average continues)

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

**From 03-01 (Blog Scraping Foundation):**
- Two operating modes in Edge Function: single_url for manual add, full scrape for blog index — Supports both automated and user-controlled workflows
- RSS auto-discovery with common path fallbacks — Maximizes RSS success without requiring user configuration
- Exclude supabase/functions from TypeScript compilation — Deno runtime conflicts with Node TypeScript compiler
- Upsert behavior via unique constraint on (blog_project_id, url) — Enables re-scraping without duplicates

**From 03-02 (Articles Data Layer):**
- Query key structure ['articles', projectId] for lists, ['articles', 'detail', id] for singles — Enables targeted cache invalidation
- No ensureProfile() in article read operations — Articles are read-only from client (writes happen server-side via Edge Function)
- Broad invalidation ['articles'] for archive/restore — Covers both active and archived lists with single invalidation
- Scrape response feedback with exact counts — Toast shows found/created/updated to give users visibility into results

**From 03-04 (Article Detail Page):**
- HTML sanitization removes script, style, iframe, object, embed tags and event handlers — Protects against XSS attacks from scraped content
- Tailwind Typography prose classes for article content — Professional long-form content styling
- Archive action navigates back to project detail page — Consistent navigation pattern with project delete

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
Stopped at: Completed 03-04-PLAN.md (article detail page)
Resume file: None
Next: Phase 3 complete — ready for Phase 4 (AI Metadata)

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
