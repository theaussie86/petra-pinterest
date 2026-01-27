---
phase: 03-blog-scraping-articles
plan: 02
subsystem: data-layer
tags: [typescript, tanstack-query, supabase, articles, caching]

requires: ["03-01"]
provides: ["article-data-layer", "article-types", "article-hooks"]
affects: ["03-03", "03-04"]

tech-stack:
  added: []
  patterns: ["TanStack Query hooks", "Supabase client queries", "optimistic invalidation"]

key-files:
  created:
    - src/types/articles.ts
    - src/lib/api/articles.ts
    - src/lib/hooks/use-articles.ts
  modified: []

decisions: []

metrics:
  duration: 95s
  completed: 2026-01-27
---

# Phase 3 Plan 2: Articles Data Layer Summary

**One-liner:** Complete typed data layer for blog articles with TanStack Query caching, scrape triggering, and archive management

## What Was Built

Created the complete data access layer for blog articles following the established pattern from Phase 2 blog projects:

**1. TypeScript Types (src/types/articles.ts):**
- Article interface matching blog_articles schema exactly
- ArticleInsert for manual URL additions
- ScrapeRequest/ScrapeResponse for Edge Function communication
- ArticleSortField and SortDirection types for future table sorting

**2. API Functions (src/lib/api/articles.ts):**
- getArticlesByProject - Fetch active articles per project (ordered by published_at DESC NULLS LAST)
- getArticle - Single article fetch by ID
- archiveArticle/restoreArticle - Soft delete pattern
- getArchivedArticles - Fetch archived articles per project
- scrapeBlog - Trigger Edge Function for full blog scrape
- addArticleManually - Trigger Edge Function for single URL

**3. TanStack Query Hooks (src/lib/hooks/use-articles.ts):**
- useArticles(projectId) - Cached article list per project (30s staleTime)
- useArticle(id) - Single article detail query
- useArchivedArticles(projectId) - Archived articles list
- useScrapeBlog - Mutation with progress toast and cache invalidation
- useArchiveArticle/useRestoreArticle - Mutations with broad cache invalidation
- useAddArticle - Manual URL addition with toast feedback

## Key Design Decisions

**Query key structure:**
- ['articles', projectId] for active article lists
- ['articles', 'detail', id] for individual articles
- ['articles', projectId, 'archived'] for archived lists
- Broad invalidation ['articles'] for archive/restore to cover both active and archived

**No ensureProfile() in read operations:**
Articles are read-only from client perspective (writes happen server-side in Edge Function via JWT). Only blog_projects create operations need ensureProfile() as the first potential write.

**Scrape response feedback:**
Toast messages show exact counts (found/created/updated) to give users visibility into scraping results.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused TypeScript imports**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** ScrapeRequest type import and data parameter in useAddArticle were unused, causing TypeScript compilation errors
- **Fix:** Removed unused import line and prefixed data parameter with underscore
- **Files modified:** src/lib/hooks/use-articles.ts
- **Commit:** 0447eab (included in Task 2 commit)

## Testing & Verification

- [x] All three files compile without errors
- [x] Types match blog_articles database schema exactly
- [x] API functions cover all CRUD + scrape operations
- [x] Hooks follow established pattern from use-blog-projects.ts
- [x] Cache invalidation correctly targets article queries by project ID
- [x] npm run build passes with zero TypeScript errors

## Commits

| Task | Commit  | Description                               |
|------|---------|-------------------------------------------|
| 1    | fadea1d | Create article types and API functions    |
| 2    | 0447eab | Create TanStack Query hooks for articles  |

## Next Phase Readiness

**Ready for 03-03 (Articles UI):**
- All data access hooks are available
- Toast notifications provide user feedback
- Cache invalidation ensures UI stays fresh after mutations

**Integration points:**
- UI components will consume useArticles for table display
- useScrapeBlog will be triggered by "Scrape Now" button
- useAddArticle for manual URL additions via dialog
- useArchiveArticle/useRestoreArticle for table row actions

**No blockers identified.**
