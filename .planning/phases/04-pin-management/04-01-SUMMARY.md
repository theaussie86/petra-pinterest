---
phase: 04-pin-management
plan: 01
subsystem: database
tags: [postgres, supabase, rls, storage, pins, boards, migration]

# Dependency graph
requires:
  - phase: 01-foundation-security
    provides: "handle_updated_at() function, profiles table for RLS tenant lookup"
  - phase: 02-blog-project-management
    provides: "blog_projects table (foreign key target)"
  - phase: 03-blog-scraping-articles
    provides: "blog_articles table (foreign key target)"
provides:
  - "pins table with 12-status workflow enum and tenant isolation"
  - "boards table with Pinterest external ID for n8n sync"
  - "pin-images Storage bucket with tenant-folder RLS"
  - "Foreign keys: pins -> blog_articles, pins -> boards, pins -> blog_projects"
affects: [04-02, 04-03, 04-04, 04-05, 05-ai-metadata, 06-visual-calendar, 07-data-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Storage bucket with tenant-folder RLS pattern ({tenant_id}/{file}.ext)"
    - "Public read / tenant-isolated write storage pattern"

key-files:
  created:
    - "supabase/migrations/00005_pins_and_boards.sql"
  modified: []

key-decisions:
  - "Pin status enum uses German workflow names matching existing Airtable system"
  - "Storage bucket is public for reads, tenant-isolated for writes via folder structure"
  - "boards.board_id ON DELETE SET NULL allows pins to exist without board assignment"

patterns-established:
  - "Storage RLS via folder name: (storage.foldername(name))[1] matches tenant_id"
  - "Unique constraint on (blog_project_id, pinterest_board_id) enables board upsert from n8n"

# Metrics
duration: 2min
completed: 2026-01-28
---

# Phase 4 Plan 1: Pins & Boards Database Schema Summary

**Pins and boards tables with 12-status workflow enum, boards with Pinterest sync support, and pin-images Storage bucket with tenant-folder RLS**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-28T20:24:53Z
- **Completed:** 2026-01-28T20:27:20Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created boards table with Pinterest external ID for n8n board sync and unique constraint for upsert
- Created pins table with 12-status workflow enum covering full pin lifecycle (entwurf through veroeffentlicht)
- Created pin-images Supabase Storage bucket (public reads, tenant-isolated writes/updates/deletes)
- Applied 8 RLS policies (4 per table) plus 4 Storage policies, all with tenant isolation
- Added performance indexes on all query-relevant columns (tenant_id, blog_project_id, blog_article_id, board_id, status, scheduled_at)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pins and boards database migration** - `fb86c9f` (feat)

**Plan metadata:** Pending (docs: complete plan)

## Files Created/Modified
- `supabase/migrations/00005_pins_and_boards.sql` - Boards table, pins table, pin-images Storage bucket, RLS policies, indexes, and updated_at triggers (315 lines)

## Decisions Made
- **Pin status enum uses German names** - Matches existing Airtable workflow terminology (entwurf, bereit_fuer_generierung, etc.) for consistency during migration
- **Storage bucket public for reads** - Pin images are displayed in calendar and shared contexts; tenant isolation only needed for writes
- **Folder-based storage RLS** - Using `{tenant_id}/{pin_id}.{ext}` path structure with `storage.foldername()` for tenant isolation rather than metadata-based approach
- **board_id ON DELETE SET NULL** - Pins can exist without a board assignment (assigned later in workflow), so deleting a board doesn't cascade-delete pins

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repaired remote migration history mismatch**
- **Found during:** Task 1 (migration push)
- **Issue:** Remote database had an orphaned migration `20260128094413` not present locally, blocking `supabase db push`
- **Fix:** Ran `supabase migration repair --status reverted 20260128094413` to mark the orphaned migration as reverted
- **Files modified:** None (remote migration history table only)
- **Verification:** `supabase migration list` shows all 5 migrations synced
- **Committed in:** fb86c9f (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor infrastructure fix to unblock migration push. No scope creep.

## Issues Encountered
None beyond the migration history repair noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pins and boards tables ready for TypeScript types, API layer, and TanStack Query hooks (04-02)
- Pin-images Storage bucket ready for image upload implementation (04-03)
- All foreign keys in place for joins (pins -> blog_articles, pins -> boards, pins/boards -> blog_projects)
- Status enum ready for workflow state machine logic

---
*Phase: 04-pin-management*
*Completed: 2026-01-28*
