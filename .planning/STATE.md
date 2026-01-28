# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Users can efficiently schedule Pinterest pins for multiple blogs from a single calendar view with visual pin previews.
**Current focus:** Phase 4 COMPLETE — Pin Management (database schema, data layer, UI). Ready for Phase 5.

## Current Position

Phase: 4 of 7 (Pin Management) -- COMPLETE
Plan: 5 of 5 in current phase
Status: Phase complete
Last activity: 2026-01-28 — Completed 04-05-PLAN.md (pin detail, edit, delete, integration)

Progress: [██████░░░░] 61%

## Performance Metrics

**Velocity:**
- Total plans completed: 22
- Average duration: ~3.3min
- Total execution time: ~1.15 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Security | 5 | ~37min | ~7min |
| 2. Blog Project Management | 6 | ~15.5min | ~2.6min |
| 3. Blog Scraping & Articles | 6 | ~14min | ~2.3min |
| 4. Pin Management | 5 | ~13.3min | ~2.7min |

**Recent Trend:**
- Last 5 plans: 04-05 (3.3min), 04-04 (3.5min), 04-03 (2.5min), 04-02 (2min), 04-01 (2min)
- Trend: Strong velocity maintained

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Migrated from TanStack Router SPA to TanStack Start — Vite 7 conflicts resolved; SPA mode later disabled (03-05) to activate server runtime for server functions and SSR
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

**From 03-06 (Inngest-Powered Blog Scraping):**
- Standalone Express server on port 3001 for blog scraping - separate from Vite dev server
- Inngest functions wrap scraping logic for durable execution - REST endpoints call helpers directly for v1
- Port Deno Edge Function to Node.js using node-html-parser and fast-xml-parser
- Service role key bypasses RLS; server enforces tenant isolation via auth token verification
- Helper functions exported from Inngest functions for reuse in REST endpoints

**From 04-01 (Pins & Boards Database Schema):**
- Pin status enum uses German workflow names matching existing Airtable system — Consistency for migration
- Storage bucket public for reads, tenant-isolated for writes — Pin images displayed in calendar/shared contexts
- Folder-based storage RLS using `{tenant_id}/{pin_id}.{ext}` path with `storage.foldername()` — Tenant isolation without metadata
- board_id ON DELETE SET NULL — Pins can exist without board assignment (assigned later in workflow)
- Unique constraint on (blog_project_id, pinterest_board_id) — Enables board upsert from n8n sync

**From 04-02 (Pin Data Layer):**
- Image upload returns path string, not full URL — URL constructed on-demand via getPinImageUrl(); keeps DB portable
- No optimistic updates on pin mutations — Consistent with update/delete pattern from Phase 2
- Bulk operations use Supabase .in() filter — Efficient multi-row operations in single query
- Storage cleanup before row deletion — deletePin/deletePins query image_path first, remove from Storage, then delete row

**From 04-03 (Pin Creation UI):**
- Controlled file state in parent dialog, not upload zone — ImageUploadZone is presentational; dialog owns state for submit flow
- Sequential image upload before bulk row insert — Upload each file to Storage individually, then create all pin rows in one createPins call
- Pins section uses section header pattern instead of Card placeholder — Matches Articles section design for consistency

**From 04-04 (Pins List & Bulk Actions):**
- Pin detail route links deferred to 04-05 — span placeholders with TODO comments avoid TypeScript errors from non-existent route
- Article title lookup via useArticles hook and Map — avoids JOIN or new API endpoint, efficient for per-project small datasets
- Dual view toggle pattern (table/grid) with shared toolbar and selection state
- Status filter tabs using client-side array filter on pin status field

**From 04-05 (Pin Detail, Edit, Delete & Integration):**
- Extract PinArticleLink, PinBoardName, ErrorAlert as local sub-components — Keeps pin detail page clean
- Reset Status button sets pin back to 'entwurf' and clears error_message — Safest recovery point
- Status dropdown shows all statuses; Phase 4 active + fehler selectable, future greyed — Users see full workflow
- Dropdown menu "View / Edit" label instead of "Edit" — Link goes to detail page, not inline edit

### Pending Todos

2 pending todo(s):
- **Cleanup AIRTABLE_PAT from ~/.zshrc** (tooling) — Remove after Airtable MCP no longer needed
- **Show scrape result summary for async Inngest jobs** (UX) — Scrape Blog runs async via Inngest so no result summary (e.g. "5 new, 2 updated") is shown to the user. Consider polling, websocket, or Inngest callback to display results.

### Blockers/Concerns

**RESOLVED (03-06):**
- ✅ **Inngest server operational:** Express server running on port 3001 with REST scraping endpoints
- ✅ **CORS gap closed:** Express server replaces Edge Function, avoids CORS issues
- Client integration (03-07) needed to complete scraping flow

**From Research:**
- ✅ Phase 1: Multi-tenant RLS is CRITICAL — ADDRESSED in 01-02 (RLS enabled on profiles table)
- Phase 6: Calendar performance with 1000+ pins needs testing (virtualization may be required)
- Phase 7: Airtable migration is high complexity — budget 2-3x expected time for formula/linked record conversion

**From 01-02:**
- Run test_rls.sql verification queries after Supabase connection established
- Complete security checklist before production launch

## Session Continuity

Last session: 2026-01-28
Stopped at: Completed 04-05-PLAN.md (pin detail, edit, delete, integration) — Phase 4 COMPLETE
Resume file: None
Next: Phase 5 — AI Metadata Generation

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
