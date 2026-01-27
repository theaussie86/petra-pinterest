---
phase: 03-blog-scraping-articles
plan: 01
subsystem: database, backend
tags: [supabase, edge-functions, deno, rss, scraping, postgres, rls]

# Dependency graph
requires:
  - phase: 02-blog-project-management
    provides: blog_projects table with tenant_id and RLS policies

provides:
  - blog_articles table with multi-tenant RLS and soft delete
  - scrape-blog Edge Function with RSS/HTML scraping and manual article add
  - Article upsert behavior via unique constraint on (blog_project_id, url)

affects: [03-02, 03-03, 03-04, 04-pin-management]

# Tech tracking
tech-stack:
  added: [Deno runtime for Edge Functions, DOMParser for HTML/XML parsing]
  patterns: [Edge Function authentication with user JWT, upsert via unique constraint]

key-files:
  created:
    - supabase/migrations/00004_blog_articles.sql
    - supabase/functions/scrape-blog/index.ts
  modified:
    - tsconfig.json

key-decisions:
  - "Two operating modes in Edge Function: single_url for manual add, full scrape for blog index"
  - "RSS with auto-discovery and HTML fallback for comprehensive blog support"
  - "Exclude supabase/functions from TypeScript compilation to avoid Deno/Node conflicts"

patterns-established:
  - "Edge Functions use user JWT from Authorization header with RLS enforcement"
  - "Upsert behavior via unique constraint enables re-scraping without duplicates"
  - "Soft delete pattern with archived_at column for articles"

# Metrics
duration: 2min
completed: 2026-01-27
---

# Phase 3 Plan 01: Blog Scraping Foundation Summary

**blog_articles table with RLS and scrape-blog Edge Function supporting RSS, HTML fallback, and manual URL addition**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-27T18:47:52Z
- **Completed:** 2026-01-27T18:49:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- blog_articles table with multi-tenant RLS, soft delete, and performance indexes
- Unique constraint on (blog_project_id, url) enables upsert behavior for re-scraping
- scrape-blog Edge Function with two operating modes: full scrape (RSS + HTML fallback) and single URL (manual add)
- RSS auto-discovery with common path fallbacks (/feed, /rss, /atom.xml)
- Comprehensive error handling and progress tracking in Edge Function

## Task Commits

Each task was committed atomically:

1. **Task 1: Create blog_articles table migration with RLS** - `8ca4127` (feat)
2. **Task 2: Create scrape-blog Edge Function** - `1774f1f` (feat)

## Files Created/Modified

- `supabase/migrations/00004_blog_articles.sql` - blog_articles table with RLS policies, unique constraint, soft delete, and performance indexes
- `supabase/functions/scrape-blog/index.ts` - Edge Function for blog scraping with RSS/HTML/single-URL modes
- `tsconfig.json` - Excluded supabase/functions from TypeScript compilation

## Decisions Made

**1. Two operating modes in Edge Function**
- Mode A (single_url): Manual article addition by URL, bypasses blog index scraping
- Mode B (full scrape): RSS with auto-discovery → HTML fallback → limit 20 articles
- Rationale: Supports both automated blog scraping and user-controlled manual additions

**2. RSS auto-discovery strategy**
- Try provided rss_url first
- Auto-discover from blog homepage link tags
- Try common paths: /feed, /rss, /feed.xml, /rss.xml, /atom.xml
- Rationale: Maximizes RSS success rate without requiring user to find feed URL

**3. HTML fallback scraping**
- Looks for article elements and links in main content area
- Fetches individual article pages to extract content
- Limits to 20 articles to prevent overload
- Rationale: Ensures scraping works even for blogs without RSS

**4. TypeScript compilation exclusion**
- Excluded supabase/functions from tsconfig.json
- Rationale: Deno runtime (URL imports, Deno globals) conflicts with Node TypeScript compiler

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - Edge Function creation and migration application completed without issues.

## User Setup Required

None - no external service configuration required. Edge Function deploys via `supabase functions deploy scrape-blog` when ready.

## Next Phase Readiness

**Ready for 03-02 (Articles data layer):**
- blog_articles table exists with RLS policies
- Unique constraint supports upsert operations
- Soft delete via archived_at enables archive/restore functionality

**Ready for 03-03 (Articles UI):**
- scrape-blog Edge Function ready to be called from frontend
- Two modes support both automated and manual workflows

**No blockers or concerns.**

---
*Phase: 03-blog-scraping-articles*
*Completed: 2026-01-27*
