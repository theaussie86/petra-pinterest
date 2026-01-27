---
phase: "03-blog-scraping-articles"
plan: "03"
subsystem: "articles-ui"
tags: ["ui", "react", "tanstack-table", "shadcn", "components"]
dependencies:
  requires: ["03-02-articles-data-layer"]
  provides: ["articles-table-component", "scrape-button-component", "add-article-dialog"]
  affects: ["project-detail-page"]
tech-stack:
  added: ["shadcn-table", "shadcn-badge", "shadcn-dropdown-menu", "shadcn-tabs"]
  patterns: ["sortable-tables", "inline-progress-feedback", "dialog-forms"]
key-files:
  created:
    - src/components/ui/table.tsx
    - src/components/ui/badge.tsx
    - src/components/ui/dropdown-menu.tsx
    - src/components/ui/tabs.tsx
    - src/components/articles/articles-table.tsx
    - src/components/articles/scrape-button.tsx
    - src/components/articles/add-article-dialog.tsx
  modified:
    - src/routes/_authed/projects/$id.tsx
    - package.json
    - package-lock.json
decisions:
  - id: "03-03-01"
    choice: "Use shadcn/ui Tabs for Active/Archived toggle"
    rationale: "Consistent with existing shadcn patterns, clear visual separation between states"
    alternatives: ["Button group", "Custom toggle"]
  - id: "03-03-02"
    choice: "Client-side sorting on fetched data"
    rationale: "Simple implementation, dataset is small (per-project articles), no server-side sorting needed yet"
    alternatives: ["Server-side sorting with query params"]
  - id: "03-03-03"
    choice: "3-second success state timeout for scrape button"
    rationale: "Gives user time to see result summary before returning to normal state"
    alternatives: ["Permanent success state until next action", "No success state (toast only)"]
  - id: "03-03-04"
    choice: "Show inline error below scrape button + toast"
    rationale: "CONTEXT.md specifies inline errors near scrape button for visibility, toast provides additional notification"
    alternatives: ["Toast only"]
metrics:
  duration: "2m 57s"
  completed: "2026-01-27"
---

# Phase 3 Plan 03: Articles List UI Summary

**One-liner:** Sortable articles table with scrape button, manual add dialog, and archive/restore actions on project detail page

## What Was Built

Built the primary articles UI on the project detail page, replacing the placeholder card with a full-featured articles section:

1. **shadcn/ui Components:** Installed Table, Badge, DropdownMenu, and Tabs components for the articles interface

2. **ArticlesTable Component:**
   - Sortable table with columns: Title (link to detail), Date, Pin Count (0 for now), URL (external link)
   - Client-side sorting with visual indicators (ArrowUp/Down/UpDown icons)
   - Toggle between Active and Archived views using shadcn Tabs
   - Archive action on active articles, Restore action on archived articles
   - Empty, loading, and error states handled gracefully
   - Title links to article detail page (created by parallel plan 03-04)

3. **ScrapeButton Component:**
   - Normal state: "Scrape Blog" with RefreshCw icon
   - Loading state: Spinner + "Scraping..." text, button disabled
   - Success state: Green background, checkmark + result summary (e.g., "5 new, 2 updated"), auto-revert after 3 seconds
   - Error state: Inline red text below button showing error message
   - Uses useScrapeBlog() mutation hook from 03-02

4. **AddArticleDialog Component:**
   - Single URL input field with validation (must start with http:// or https://)
   - Uses react-hook-form + zod for validation (consistent with ProjectDialog pattern)
   - Calls useAddArticle() mutation hook to trigger scraping of single URL
   - Closes on success, shows error inline on failure

5. **Project Detail Page Integration:**
   - Replaced articles placeholder card with full-width articles section
   - Added "Add Article" and "Scrape Blog" buttons above ArticlesTable
   - Moved Pins placeholder below (no longer in 2-column grid)
   - Articles section spans full width for better table display

## Deviations from Plan

None - plan executed exactly as written.

## Key Technical Decisions

**Client-side sorting:** Articles are sorted in the component rather than requesting sorted data from the server. Since articles are fetched per-project (not globally), datasets are small enough for client-side sorting to perform well. This simplifies the implementation and avoids query parameter management.

**Tabs for Active/Archived toggle:** Used shadcn/ui Tabs component for clear visual separation between active and archived article views. Consistent with existing shadcn patterns and provides accessible, keyboard-navigable UI.

**3-second success state:** ScrapeButton shows success state (green background, result summary) for 3 seconds before reverting to normal. Gives users time to see the results without requiring manual dismissal.

**Inline + toast errors:** Scrape button shows errors inline (red text below button) as specified in CONTEXT.md, plus toast notification for consistency with other mutations. Inline placement ensures user sees the error near the action they took.

## Testing Notes

- `npm run build` passed with zero TypeScript errors
- All components follow established patterns from Phase 2
- Table component installed via shadcn CLI with standard primitives
- Badge, DropdownMenu, Tabs also installed via shadcn CLI
- Article detail route link created (route implemented by parallel plan 03-04)

## Next Phase Readiness

**Blockers:** None

**Concerns:**
- Article detail page (/articles/$articleId) is being created by parallel plan 03-04 - once both plans merge, the link in ArticlesTable will work correctly
- Pin count is hard-coded to 0 (pins don't exist yet) - will be replaced with real data in Phase 4

**Dependencies satisfied:**
- ✅ Articles data layer (03-02) provides all required hooks
- ✅ Blog scraping Edge Function (03-01) handles both full scrape and manual add

**Ready for:**
- Phase 4: Pins (can start after article detail page is complete)
- User can now view, scrape, add, and manage articles

## Files Changed

**Created (7 files):**
- `src/components/ui/table.tsx` - shadcn/ui Table primitives
- `src/components/ui/badge.tsx` - shadcn/ui Badge component
- `src/components/ui/dropdown-menu.tsx` - shadcn/ui DropdownMenu component
- `src/components/ui/tabs.tsx` - shadcn/ui Tabs component
- `src/components/articles/articles-table.tsx` - Sortable articles table with archive/restore
- `src/components/articles/scrape-button.tsx` - Scrape trigger with inline progress
- `src/components/articles/add-article-dialog.tsx` - Manual article addition dialog

**Modified (3 files):**
- `src/routes/_authed/projects/$id.tsx` - Replaced placeholder with articles section
- `package.json` - Added @radix-ui dependencies for new shadcn components
- `package-lock.json` - Locked dependency versions

## User-Facing Changes

Users can now:
- ✅ View a sortable table of articles on the project detail page
- ✅ Click "Scrape Blog" to fetch articles from their blog (see inline progress)
- ✅ Click "Add Article" to manually add a single article by URL
- ✅ Sort articles by Title, Date, or URL (ascending/descending)
- ✅ Archive articles to hide them from the active view
- ✅ View archived articles in a separate tab
- ✅ Restore archived articles back to active status
- ✅ Click article titles to view detail page (link ready, route created by 03-04)
- ✅ See empty state when no articles exist
- ✅ See loading spinner while articles fetch
- ✅ See error state with retry button if fetch fails

This completes the primary deliverable of Phase 3 - users now have a fully functional articles management interface.
