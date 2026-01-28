---
phase: 04-pin-management
plan: 02
subsystem: data-layer
tags: [typescript, tanstack-query, supabase, pins, boards, hooks, api, storage]

# Dependency graph
requires:
  - phase: 04-pin-management
    plan: 01
    provides: "pins table, boards table, pin-images Storage bucket"
  - phase: 02-blog-project-management
    provides: "API and hooks patterns (blog-projects.ts, use-blog-projects.ts)"
  - phase: 03-blog-scraping-articles
    provides: "API and hooks patterns (articles.ts, use-articles.ts)"
provides:
  - "Pin, PinInsert, PinUpdate, Board TypeScript types"
  - "PIN_STATUS constant with 12 workflow states, labels, and colors"
  - "12 Supabase API functions for pins CRUD, bulk ops, image upload, boards"
  - "9 TanStack Query hooks with toast feedback and cache invalidation"
affects: [04-03, 04-04, 04-05, 05-ai-metadata, 06-visual-calendar, 07-data-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tenant-prefixed Storage paths for image upload ({tenantId}/{uuid}.{ext})"
    - "Storage cleanup on delete (query image_path, remove from Storage, then delete row)"
    - "Bulk mutation hooks with dynamic toast messages ({n} pins deleted/updated)"

key-files:
  created:
    - "src/types/pins.ts"
    - "src/lib/api/pins.ts"
    - "src/lib/hooks/use-pins.ts"
  modified: []

key-decisions:
  - "Image upload returns path string, not full URL — URL constructed on-demand via getPinImageUrl()"
  - "No optimistic updates on pin mutations — consistent with update/delete pattern from Phase 2"
  - "Bulk operations use Supabase .in() filter for efficient multi-row operations"

patterns-established:
  - "uploadPinImage returns Storage path for DB storage; getPinImageUrl constructs public URL from path"
  - "Bulk hooks accept { ids, status } object for named parameters"
  - "Phase-aware status arrays (PHASE4_ACTIVE_STATUSES, PHASE4_DISABLED_STATUSES) for progressive feature enablement"

# Metrics
duration: 2min
completed: 2026-01-28
---

# Phase 4 Plan 2: Pin Data Layer Summary

**Complete TypeScript data pipeline for pins: types with 12-status workflow constants, 12 Supabase API functions (CRUD, bulk, image upload, boards), and 9 TanStack Query hooks with toast feedback**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-28T20:30:19Z
- **Completed:** 2026-01-28T20:33:00Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Created Pin, PinInsert, PinUpdate, Board TypeScript interfaces matching database schema exactly
- Defined PIN_STATUS constant with all 12 German workflow states, display labels, and badge colors
- Added Phase 4 active/disabled status arrays for progressive UI enablement
- Implemented getStatusBadgeClasses() helper for Tailwind CSS badge styling
- Built 12 API functions: getPinsByProject, getPin, createPin, createPins, updatePin, deletePin, deletePins, updatePinStatus, updatePinsStatus, uploadPinImage, getPinImageUrl, getBoardsByProject
- Built 9 TanStack Query hooks: usePins, usePin, useCreatePin, useCreatePins, useUpdatePin, useDeletePin, useBulkDeletePins, useBulkUpdatePinStatus, useBoards
- Image upload generates tenant-prefixed paths for Storage RLS compatibility
- Delete operations clean up Storage images before removing pin rows
- All mutation hooks include Sonner toast success/error feedback and query cache invalidation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pin types and status constants** - `8bd7681` (feat)
2. **Task 2: Create pin API functions and TanStack Query hooks** - `58fd82e` (feat)

## Files Created/Modified
- `src/types/pins.ts` - Pin, PinInsert, PinUpdate, Board interfaces; PIN_STATUS constants; Phase 4 status arrays; getStatusBadgeClasses helper (100 lines)
- `src/lib/api/pins.ts` - 12 Supabase API functions for pins CRUD, bulk ops, image upload, and boards (170 lines)
- `src/lib/hooks/use-pins.ts` - 9 TanStack Query hooks with toast feedback and cache invalidation (132 lines)

## Decisions Made
- **Image upload returns path, not URL** - Store the Storage path in the database (`{tenantId}/{uuid}.ext`); construct the public URL on-demand via `getPinImageUrl()`. This keeps the DB portable and avoids hardcoding the Supabase project URL.
- **No optimistic updates on pin mutations** - Consistent with the Phase 2 pattern where only `createBlogProject` uses optimistic updates. Pin CRUD follows the simpler invalidate-on-success pattern.
- **Bulk operations via .in() filter** - `deletePins`, `updatePinsStatus` use Supabase's `.in('id', ids)` for efficient multi-row operations in a single query.
- **Storage cleanup before row deletion** - `deletePin` and `deletePins` query for `image_path` first, remove files from Storage, then delete the database row. Prevents orphaned images.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. One pre-existing TypeScript error in `use-blog-projects.ts` (missing `sitemap_url` in optimistic update) was noted but not related to this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Types, API functions, and hooks are ready for Pin Creation UI (04-03)
- Board hooks ready for board selection dropdowns in pin forms
- Bulk operation hooks ready for pin table multi-select actions (04-04)
- Status constants and badge helper ready for pin list status column rendering

---
*Phase: 04-pin-management*
*Completed: 2026-01-28*
