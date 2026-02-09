---
phase: 06-visual-calendar
plan: 01
subsystem: calendar-foundation
tags:
  - calendar
  - filtering
  - routing
  - ui
dependency_graph:
  requires:
    - 05-05 (Phase 5 complete - pin statuses and data)
  provides:
    - Calendar route with filter infrastructure
    - Cross-project pin fetching API
    - URL-based filter persistence
  affects:
    - Header navigation (added Calendar link)
tech_stack:
  added:
    - TanStack Router search params for filter state
  patterns:
    - Client-side filtering for cross-project pin views
    - URL param persistence for filter state
    - Segmented control for view toggle
key_files:
  created:
    - src/routes/_authed/calendar.tsx
  modified:
    - src/lib/api/pins.ts
    - src/lib/hooks/use-pins.ts
    - src/components/layout/header.tsx
    - src/lib/hooks/use-blog-projects.ts
decisions:
  - Client-side filtering for calendar view (all pins fetched once, filtered in memory)
  - Tab toggle state in URL params (enables shareable filtered views)
  - Status chips exclude 'deleted' status (not relevant for calendar workflow)
  - Placeholder content areas for Calendar and Unscheduled views (populated in Plans 02-04)
metrics:
  duration: 3.1min
  tasks_completed: 2
  files_created: 1
  files_modified: 4
  commits: 2
  completed_date: 2026-02-09
---

# Phase 6 Plan 01: Calendar Foundation Summary

Calendar page data layer, route, filtering system, and navigation established.

## Overview

Created the foundation for the visual calendar feature - a new route at `/calendar` with cross-project pin fetching, multi-dimensional filtering (project dropdown + status chips), tab toggle between Calendar and Unscheduled views, and URL parameter persistence for all filter state.

## Tasks Completed

### Task 1: Add cross-project pin fetching to data layer
- Added `getAllPins()` API function to `src/lib/api/pins.ts`
  - Queries all pins for authenticated tenant (RLS handles isolation)
  - Ordered by `scheduled_at` ascending (nulls last), then `created_at` descending
  - Returns `Pin[]` across all projects
- Added `useAllPins()` hook to `src/lib/hooks/use-pins.ts`
  - Query key: `['pins', 'all']`
  - staleTime: 30000ms (matches existing pattern)
  - No `enabled` guard (always fetches)
- **Commit:** 31931e7

### Task 2: Create calendar route with filter controls and tab toggle
- Created `src/routes/_authed/calendar.tsx` as TanStack Router file-based route
  - Protected by `_authed` layout (auth guard)
  - Search params schema: `project`, `statuses[]`, `tab`
  - Client-side filtering by project and statuses
  - Split filtered pins into `scheduledPins` and `unscheduledPins`
- Project dropdown filter
  - shadcn/ui Select component
  - "All Projects" option (clears filter)
  - Individual project options from `useBlogProjects()`
  - Updates URL param `project` on change
- Status toggle chips
  - One chip per status (excluding 'deleted')
  - Active chips use `getStatusBadgeClasses()` for correct colors
  - Inactive chips use muted slate styling
  - Toggles status in/out of `statuses[]` URL param array
- Tab toggle (Calendar / Unscheduled)
  - Segmented control pattern (similar to table/grid toggle)
  - Updates `tab` URL search param
  - Switches placeholder content area
- Header navigation update
  - Added "Dashboard" and "Calendar" links to header
  - Active state styling via TanStack Router `activeProps`
  - Links positioned next to "Petra" branding
- Placeholder content areas
  - Calendar view shows scheduled pin count
  - Unscheduled view shows unscheduled pin count
  - Will be replaced with actual calendar grid (Plan 02) and unscheduled list (Plan 03)
- **Commit:** 8ea5901

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing sitemap_url in optimistic update**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `useBlogProjects` hook's optimistic update was missing the `sitemap_url` field, causing TypeScript error: "Property 'sitemap_url' is missing in type..."
- **Fix:** Added `sitemap_url: newProject.sitemap_url ?? null` to optimistic temp project object in `src/lib/hooks/use-blog-projects.ts`
- **Files modified:** src/lib/hooks/use-blog-projects.ts
- **Commit:** 31931e7 (included with Task 1)

## Verification Results

All verification criteria passed:

1. ✅ `/calendar` route is accessible and protected by auth guard
2. ✅ `useAllPins()` fetches all pins across all projects
3. ✅ Project dropdown filters pins client-side
4. ✅ Status chips filter pins by multiple statuses simultaneously
5. ✅ Tab toggle switches content area between calendar/unscheduled
6. ✅ All filter state persists in URL and survives refresh
7. ✅ Header includes Calendar navigation link
8. ✅ TypeScript compiles with no errors

Dev server running successfully on http://localhost:3000 with no errors.

## Key Decisions

**Client-side filtering approach:** All pins are fetched once via `getAllPins()` and filtered in memory by project and statuses. This is efficient for v1 scale (hundreds of pins) and enables instant filter updates without server round-trips. If the dataset grows to thousands of pins, this can be migrated to server-side filtering with pagination.

**URL param persistence:** All filter state (project, statuses, tab) is stored in TanStack Router search params, making filtered views shareable and enabling browser back/forward navigation through filter changes.

**Status chip design:** Chips use the same `getStatusBadgeClasses()` function as the PinStatusBadge component for color consistency. Active chips show full color, inactive chips are muted slate. The 'deleted' status is excluded from filter chips as it's not relevant to the calendar workflow.

**Placeholder content areas:** Calendar and Unscheduled views currently show simple placeholder divs with pin counts. These will be replaced with:
- Plan 02: Full calendar grid with drag-and-drop
- Plan 03: Unscheduled pins list with drag to calendar
- Plan 04: Integration and polish

## Next Steps

Phase 6 Plan 02 will implement the visual calendar grid with:
- Month/week view toggle
- Day cells with scheduled pins
- Visual pin previews (image thumbnails + title)
- Drag-and-drop rescheduling
- Click to view pin detail

Phase 6 Plan 03 will implement the unscheduled pins view:
- Filterable list of pins without scheduled_at
- Drag from list to calendar to schedule
- Bulk actions (schedule multiple pins)

## Self-Check

Verifying all claims in this summary:

**Created files:**
- ✅ FOUND: src/routes/_authed/calendar.tsx

**Commits:**
- ✅ FOUND: commit 31931e7
- ✅ FOUND: commit 8ea5901

**Self-Check: PASSED**

All claimed files and commits verified. Plan execution complete.
