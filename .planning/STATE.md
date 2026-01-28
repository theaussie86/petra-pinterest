# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Users can efficiently schedule Pinterest pins for multiple blogs from a single calendar view with visual pin previews.
**Current focus:** Phase 3 complete (verified) — ready for Phase 4

## Current Position

Phase: 3 of 7 (Blog Scraping & Articles) — BLOCKED
Plan: 5 of 5 in current phase (gap closure attempt)
Status: Blocked ⚠ — Server functions incompatible with current tooling
Last activity: 2026-01-28 — 03-05 blocked by Vite bundling issue

Progress: [█████░░░░░] 43%

## Performance Metrics

**Velocity:**
- Total plans completed: 16
- Average duration: ~3.7min
- Total execution time: ~1.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Security | 5 | ~37min | ~7min |
| 2. Blog Project Management | 6 | ~15.5min | ~2.6min |
| 3. Blog Scraping & Articles | 4 | ~10.5min | ~2.6min |

**Recent Trend:**
- Last 5 plans: 03-03 (3min), 03-04 (2min), 03-02 (1.5min), 03-01 (2min), 02-06 (1min)
- Trend: Exceptional velocity maintained (Phase 3 completed in 10.5min total)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Migrated from TanStack Router SPA to TanStack Start (SPA mode) — Vite 7 conflicts resolved; Start unlocks server functions and SSR capability while `spa: { enabled: true }` keeps all client-side code working unchanged
- Path alias @/ instead of ~/ — Matches official template convention; now resolved by `vite-tsconfig-paths` instead of manual Vite alias
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

**From 03-03 (Articles List UI):**
- Client-side sorting on fetched data — Articles are per-project (small datasets), no server-side sorting needed yet
- Use shadcn/ui Tabs for Active/Archived toggle — Consistent with existing shadcn patterns, accessible keyboard navigation
- 3-second success state timeout for scrape button — Gives users time to see result summary before returning to normal
- Inline + toast errors for scrape button — CONTEXT.md specifies inline errors near action, toast provides additional notification

**From 03-04 (Article Detail Page):**
- HTML sanitization removes script, style, iframe, object, embed tags and event handlers — Protects against XSS attacks from scraped content
- Tailwind Typography prose classes for article content — Professional long-form content styling
- Archive action navigates back to project detail page — Consistent navigation pattern with project delete

**From TanStack Start Migration (between Phase 3 and 4):**
- Entry points: `src/main.tsx` + `index.html` replaced by `src/router.tsx` (getRouter factory) + `src/client.tsx` (hydrateRoot) + `src/server.ts` (Start handler)
- `__root.tsx` is now the full HTML document shell (`<html>`, `<head>`, `<body>`) with `HeadContent` and `Scripts` — replaces `index.html`
- `QueryClientProvider` moved from deleted `main.tsx` into `__root.tsx`
- CSS import (`styles.css`) moved from deleted `main.tsx` into `__root.tsx`
- Vite config: `tanstackStart()` replaces both `tanstackRouter()` and `viteReact()`; `tsConfigPaths()` replaces manual `resolve.alias`
- Auth callback: must handle both `SIGNED_IN` and `INITIAL_SESSION` events — `hydrateRoot` timing means Supabase may process URL tokens before the `onAuthStateChange` listener is registered
- Build output: `.output/` directory (added to `.gitignore`), production server via `node .output/server/index.mjs`
- **SPA mode disabled** (03-05): Server runtime now active, but server functions blocked by Vite bundling incompatibility

**From 03-05 (CORS Fix Attempt - BLOCKED):**
- SPA mode successfully disabled - TanStack Start server runtime enabled
- Server functions (`createServerFn`) INCOMPATIBLE with Vite 7 + TanStack Start 1.157.16 - `node:stream` bundling error
- CORS errors from Edge Function remain unresolved - blog scraping still broken
- **Architectural decision required:** Alternative approach needed to resolve CORS (see 03-05-SUMMARY.md for options)

### Pending Todos

1 pending todo(s):
- **Cleanup AIRTABLE_PAT from ~/.zshrc** (tooling) — Remove after Airtable MCP no longer needed

### Blockers/Concerns

**ACTIVE BLOCKER (03-05):**
- 🚨 **CORS errors blocking blog scraping** — Edge Function fails with CORS when called from SPA
- 🚨 **TanStack Start server functions incompatible** — Vite 7 bundling error with `node:stream` imports
- **Decision required:** Choose alternative approach to resolve CORS (see 03-05-SUMMARY.md)
  - Option A: Fix CORS headers on Edge Function (simplest)
  - Option B: Vite dev proxy (dev-only workaround)
  - Option C: Wait for TanStack Start compatibility fix
  - Option D: Separate Node.js API service
  - Option E: Client-side scraping via backend proxy

**From Research:**
- ✅ Phase 1: Multi-tenant RLS is CRITICAL — ADDRESSED in 01-02 (RLS enabled on profiles table)
- Phase 6: Calendar performance with 1000+ pins needs testing (virtualization may be required)
- Phase 7: Airtable migration is high complexity — budget 2-3x expected time for formula/linked record conversion

**From 01-02:**
- Run test_rls.sql verification queries after Supabase connection established
- Complete security checklist before production launch

## Session Continuity

Last session: 2026-01-28
Stopped at: 03-05-PLAN.md blocked - architectural decision required
Resume file: None
Next: BLOCKED - resolve CORS approach decision before Phase 4

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
