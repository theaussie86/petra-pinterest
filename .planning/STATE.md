# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Users can efficiently schedule Pinterest pins for multiple blogs from a single calendar view with visual pin previews.
**Current focus:** Phase 9 complete — Sidebar layout, PageLayout standardization, and layout gap closure all verified.

## Current Position

Phase: 9 of 9 (Consistent UI & Dashboard Layout)
Plan: 7 of 7 in phase
Status: Complete - All layout gaps closed, nested routes implemented
Last activity: 2026-02-10 — Plan 09-07 complete (Nested Route Structure)

Progress: [████████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 46
- Average duration: ~12.5min
- Total execution time: ~9.95 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation & Security | 5 | ~37min | ~7min |
| 2. Blog Project Management | 6 | ~15.5min | ~2.6min |
| 3. Blog Scraping & Articles | 6 | ~14min | ~2.3min |
| 4. Pin Management | 6 | ~15.3min | ~2.6min |
| 5. AI Metadata & Publishing | 5 | ~13.3min | ~2.7min |
| 6. Visual Calendar | 5 | ~14.5min | ~2.9min |
| 8. Pinterest OAuth | 5 | ~35min | ~2.5min |
| 9. Consistent UI & Dashboard Layout | 7 | ~460.4min | ~65.8min |

**Recent Trend:**
- Last 5 plans: 09-07 (3min), 09-05 (1.4min), 09-04 (446.5min), 09-03 (4.3min), 09-02 (2min)
- Trend: Phase 9 complete with nested routes and gap closure, all phases finished

*Updated after each plan completion*
| Phase 06 P05 | 120 | 3 tasks | 3 files |
| Phase 07 P01 | 2.6 | 2 tasks | 6 files |
| Phase 07 P02 | 2.0 | 2 tasks | 4 files |
| Phase 07 P03 | 2 | 1 tasks | 3 files |
| Phase 08 P01 | 144 | 2 tasks | 4 files |
| Phase 08 P02 | 148 | 2 tasks | 3 files |
| Phase 08 P03 | 169 | 3 tasks | 4 files |
| Phase 08 P04 | 163 | 2 tasks | 4 files |
| Phase 08 P05 | 25 | 3 tasks | 10 files |
| Phase 09 P01 | 3 | 2 tasks | 11 files |
| Phase 09 P02 | 2 | 2 tasks | 3 files |
| Phase 09 P03 | 4.3 | 2 tasks | 4 files |
| Phase 09 P04 | 446.5 | 1 tasks | 0 files |
| Phase 09 P05 | 83 | 2 tasks | 2 files |
| Phase 09 P07 | 3 | 2 tasks | 6 files |
| Phase 09 P06 | 5 | 2 tasks | 2 files |

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

**From 04-06 (UAT Gap Closure):**
- Inline Dialog confirmations with state-driven open/close — Separate state variables for bulk vs single delete enables independent dialog management
- Complete CSS custom property definitions in @theme block — Added all missing shadcn variables (popover, card, input, ring) for comprehensive component styling
- Dialog component (not AlertDialog) matching existing DeletePinDialog pattern — Consistent with established component patterns

**From 05-01 (AI Metadata Generation Foundation):**
- Use GPT-4o with `detail: 'auto'` for vision input — Cost-efficient for mid-resolution pin images (1000x1500px), intelligently selects resolution based on image complexity
- Truncate article content to 4000 chars (~1000 tokens) — Reduces input tokens by 50-70% while maintaining metadata quality
- Track previous_status via database trigger — Error recovery "Reset to previous state" button needs status before error, trigger function automatically sets `NEW.previous_status = OLD.status` when status changes
- Separate pin_metadata_generations table for history — Enables comparison and regeneration with feedback refinement loop, keep last 3 generations per pin (application layer)

**From 05-02 (Metadata Generation Pipeline):**
- Server function error handling pattern — Wrap entire handler in try/catch, on error update pin status to 'fehler', set error_message, re-throw
- Feedback regeneration conversation structure — System prompt, user (article + image), assistant (previous generation), user (feedback)
- Generation history pruning strategy — Keep last 3 generations per pin, prune after every insert using NOT IN clause on top 3 by created_at DESC
- TanStack Query invalidation scope — Invalidate both ['pins'] and ['metadata-history'] on all mutations for comprehensive UI updates

**From 05-03 (Single Pin Metadata Generation UI):**
- Button visibility toggles between generate and regenerate modes based on presence of metadata — Minimizes UI clutter for new pins
- Current generation distinguished with Badge in history dialog — Visual distinction prevents user confusion about which generation is active
- Feedback dialog clears text on close to prevent stale input — Prevents stale feedback text from previous sessions
- Dialog state managed by parent component with controlled open/onOpenChange props — Consistent pattern for all metadata dialogs

**From 05-04 (Pin Scheduling UI):**
- Sequential bulk scheduling to avoid rate limits — Process pins one at a time instead of Promise.all for reliability with large batches
- Preset time buttons for common scheduling times — Quick-select buttons (6:00, 9:00, 12:00, 15:00, 18:00, 21:00) with native HTML5 time input fallback
- Asymmetric status handling on schedule operations — Scheduling auto-advances status to bereit_zum_planen, but clearing schedule does NOT auto-change status (user decides next state)
- Date picker prevents past dates — UI-level validation disables past dates in Calendar component

**From 05-05 (Phase 5 Integration):**
- Status constant evolution pattern — PHASE4_ACTIVE_STATUSES renamed to ACTIVE_STATUSES for Phase 5, PHASE4_DISABLED_STATUSES renamed to SYSTEM_MANAGED_STATUSES for semantic clarity
- Phase 5 active statuses — entwurf, bereit_fuer_generierung, metadaten_generieren, metadaten_erstellt, bereit_zum_planen (5 user-selectable statuses)
- Error recovery uses previous_status — Reset Status button restores pin.previous_status || 'entwurf' instead of always 'entwurf', database trigger tracks this automatically
- Bulk action selection handling — Generate Metadata clears selection after triggering, Schedule keeps selection open until dialog confirmed
- Scheduled date visibility — Added "Scheduled" column to table view and scheduled date display in grid view card overlay

**From 06-01 (Calendar Foundation):**
- Client-side filtering for calendar view — All pins fetched once via getAllPins(), filtered in memory by project and statuses; efficient for v1 scale (hundreds of pins), enables instant filter updates
- URL param persistence for filter state — All filter state (project, statuses, tab) stored in TanStack Router search params, makes filtered views shareable and enables browser navigation through filter changes
- Status chips exclude 'deleted' status — Not relevant for calendar workflow, chips show all other statuses with toggle behavior
- Placeholder content areas for Calendar and Unscheduled views — Simple divs with pin counts, will be replaced with calendar grid (Plan 02) and unscheduled list (Plan 03)

**From 06-02 (Calendar Grid Implementation):**
- Separate component composition pattern — CalendarHeader + CalendarDayCell + CalendarGrid for maintainability, enables independent updates to navigation UI vs cell rendering logic
- Status-colored borders for pin thumbnails — STATUS_BORDER_CLASSES maps PIN_STATUS colors to Tailwind border classes (slate→border-slate-400, blue→border-blue-400, etc.) for visual status indication
- Overflow thresholds by view — Month view shows 3 thumbnails (32x32px) before "+N more" badge, week view shows 6 (48x48px); balances information density with visual cleanliness
- Pin click placeholder for sidebar — handlePinClick currently logs to console, will open detail sidebar in Plan 03
- Loading skeleton matches month view — 7-col header + 42 cells minimizes layout shift when data loads
- Empty state with user guidance — "Try adjusting your project or status filters" helps users understand why calendar is empty

**From 06-03 (Pin Detail Sidebar):**
- Sidebar does NOT close after save — User stays to continue editing or viewing, enables rapid multi-field updates without repeated click-open cycles
- Main content shifts left (mr-[350px]) instead of overlapping — Preserves calendar interactivity while sidebar is open, users can still navigate months and change filters
- Sidebar uses same edit schema and status selection logic as EditPinDialog — Consistency across UI, shared validation patterns
- DeletePinDialog onDeleted callback closes sidebar — Pin no longer exists after deletion, sidebar automatically dismisses
- Fixed-position sidebar pattern — Right position, z-40, h-[calc(100vh-64px)], overflow-y-auto, transition-all duration-200 for smooth appearance
- Escape key handling with cleanup — Add listener on mount when pinId present, cleanup on unmount to prevent memory leaks

**From 06-04 (Drag-and-Drop & Unscheduled Pins):**
- Use native HTML5 Drag and Drop API instead of external library — Simple drag-between-cells interaction doesn't warrant library overhead
- Memoize CalendarDayCell with custom comparison function — Prevents unnecessary re-renders during drag operations by comparing only pin count and IDs, not full pin objects
- Show project name instead of article title in unscheduled list — Unscheduled pins come from all projects, avoiding per-project useArticles queries keeps it efficient
- Clear selection after bulk schedule dialog closes — Consistent with bulk scheduling UX, pins move out of unscheduled view so selection becomes stale

**From 06-05 (Board Select Fix - Gap Closure):**
- Use __none__ sentinel consistently in form state for controlled Radix UI Select components — Prevents value mismatch with SelectItem options, conversion to null only at submission boundary
- Surface actual error messages in all mutation hooks — All onError handlers accept Error parameter and display error.message, enables debugging of database constraints and RLS errors

**From 07-01 (Migration Foundation):**
- Individual TEXT columns for branding fields (not JSONB) — Enables direct SQL queries and column-level indexing, better query flexibility
- Service role key for migration scripts bypasses RLS — Required for tenant-specific writes during migration, application-level validation provides defense-in-depth
- Field mapping with umlaut variants (ö/o, ä/a) — Handles German field name inconsistencies in Airtable data
- Rate limiting (100ms) for Airtable API — Respects 5 req/sec limit, prevents throttling during large data transfers


**From 07-02 (Blog Projects & Articles Migration):**
- Unique constraint upsert strategy for article idempotency — Articles upserted via (blog_project_id, url) unique constraint instead of explicit ID mapping, simpler and matches schema design
- All Airtable article statuses map to active — blog_articles uses archived_at for state (not status column), all migrated articles active (Fehler status logged but not blocking)
- Full article content migration without truncation — TEXT column stores complete HTML content up to 33K+ chars for accurate migration

**From 07-03 (Boards Migration):**
- Temporary Airtable CDN URLs for board cover images — Deferred to Plan 05 (image migration), separates entity migration from asset migration for cleaner execution
- Force-commit id-maps.json despite gitignore — Critical mapping file required for subsequent migrations, explicitly tracked in version control
- Dual upsert strategy for boards — Unique constraint (blog_project_id, pinterest_board_id) for boards with Pinterest ID, name+project lookup for boards without

**From 08-01 (Pinterest OAuth Foundation):**
- Supabase Vault for encrypted Pinterest OAuth token storage — Pinterest OAuth tokens require encryption at rest; Vault provides built-in encryption with SECURITY DEFINER RPC functions
- Service role bypass policies for Inngest background publishing jobs — Background jobs run without user session context; service_role policies enable tenant-isolated writes after token-based auth
- PKCE OAuth flow over implicit grant — Pinterest API v5 requires authorization code flow with PKCE; implicit grant deprecated
- 'publishing' status added as system-managed — Prevents manual status setting during async publish; system controls ready_to_schedule → publishing → published/error transition

**From 08-02 (Pinterest OAuth Flow):**
- Service role client for Vault operations — Authenticated client (getSupabaseServerClient) can't access vault.secrets directly; Vault RPC functions use SECURITY DEFINER, called via service role client (getSupabaseServiceClient)
- OAuth state mapping with database storage — Stored with 10-minute expiration, enables CSRF protection + request context (blog_project_id) preservation for redirect after OAuth
- Connection reuse across projects — Multiple blog projects can share one Pinterest connection; disconnect only removes FK, cleanup (tokens + connection) only when no other projects reference it
- Exchange callback returns blog_project_id — Enables redirect back to specific project page after OAuth completion instead of generic dashboard landing

**From 08-04 (Pin Publishing & Token Refresh):**
- Exported publishSinglePin helper for Inngest reuse — Single source of truth prevents drift between manual and cron publish logic
- 10-second delay between bulk publishes — Conservative rate limiting (6 pins/min = 360/hour) provides safety margin below Pinterest's 300 req/hour limit
- No auto-retry on publish failure in manual functions — Per user decision, failures set pin to error status for manual review
- Inngest cron uses step.sleep for rate limiting — Enables durable execution with proper sleep/resume semantics instead of setTimeout
- Vault security pattern for all token retrieval — get_pinterest_access_token, get_pinterest_refresh_token, store_pinterest_tokens RPCs with service role client

**From 08-05 (Publishing UI Integration):**
- PublishPinButton handles all pin states in single reusable component — Props-driven rendering logic (published, publishing, error, ready, no connection, no board) avoids duplication across UI surfaces
- Pinterest connection check via usePinterestConnection hook — Context-aware button states disable when no connection, show helpful tooltips
- Published pins show clickable Pinterest URL — "View on Pinterest" link with ExternalLink icon enables verification on pinterest.com
- Bulk publish clears selection after completion — Consistent with bulk scheduling UX, pins move to different status filter
- Tooltip for disabled states — shadcn/ui Tooltip component explains blocking conditions ("Connect Pinterest in project settings", "Assign a Pinterest board first")

**From 09-01 (Shared Layout Components Foundation):**
- Remove tw-animate-css import instead of installing package — shadcn CLI added @import but package not installed; Tailwind CSS v4 provides all needed animation utilities without external dependency
- CVA container variants for PageLayout flexibility — Four maxWidth options (narrow/medium/wide/full) with cn() composition enables custom overrides (e.g. calendar page adds mr-[350px] for pin sidebar)
- PageLayout conditional rendering for loading/error states — Centralized logic for LoadingSpinner and ErrorState display keeps route code clean
- AppSidebar uses DropdownMenu for user menu — Consistent with existing shadcn/ui patterns, replaces custom dropdown state management from header.tsx
- [Phase 09]: Document layout gaps as future work instead of blocking Phase 9 completion (sidebar overlap, resize button, collapse behavior, topbar size)
- [Phase 09-05]: Moved SidebarTrigger outside breadcrumbs conditional for universal visibility
- [Phase 09-05]: Applied min-w-0 to SidebarInset to constrain flex child width
- [Phase 09-05]: Reduced PageHeader padding and title size for more compact header

**From 09-07 (Nested Route Structure):**
- Article and pin detail routes moved from flat paths to nested paths under projects — URLs reflect project hierarchy: `/projects/{projectId}/articles/{articleId}` and `/projects/{projectId}/pins/{pinId}`
- Breadcrumbs show 3-level hierarchy: Dashboard > Project Name > Entity — useBlogProject hook fetches project name for middle breadcrumb
- TanStack Router auto-generates route tree on file changes — No manual routeTree.gen.ts editing required
- PinCard uses pin.blog_project_id directly for nested links — Avoids prop drilling, Pin type already includes blog_project_id
- Nested routes use $projectId param (differs from existing $id in projects/$id.tsx) — Creates separate route branches, correct for standalone detail pages
- [Phase 09-06]: Use inline style={{width}} instead of Tailwind v4 w-[--sidebar-width] syntax for CSS variable resolution

### Roadmap Evolution

- Phase 8 added: Pinterest OAuth Authentication for Multi-Account Publishing
- Phase 9 added: Consistent UI & Dashboard Layout

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

**From 09-04 (Layout Verification) - RESOLVED in 09-05:**
✅ All Phase 9 layout gaps closed:
1. Sidebar content overlap — Fixed via min-w-0 on SidebarInset
2. Sidebar collapse working — Fixed via proper flexbox constraints
3. SidebarTrigger visible on all pages — Fixed via restructured PageHeader
4. Compact PageHeader — Fixed via reduced padding (py-2) and title size (text-lg)

## Session Continuity

Last session: 2026-02-10
Stopped at: Completed 09-06-PLAN.md (Sidebar Layout Gap Closure) — Phase 9 complete with all UAT gap closure plans executed
Resume file: None
Next: Production deployment ready - Phase 9 complete

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
