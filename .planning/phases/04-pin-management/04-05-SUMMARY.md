---
phase: 04-pin-management
plan: 05
subsystem: ui
tags: [react, tanstack-router, tanstack-query, shadcn, pin-detail, edit-dialog, delete-dialog, status-workflow]

# Dependency graph
requires:
  - phase: 04-02
    provides: Pin data layer (usePin, useUpdatePin, useDeletePin hooks, getPinImageUrl)
  - phase: 04-03
    provides: CreatePinDialog wired to project detail page
  - phase: 04-04
    provides: PinsList, PinCard, PinStatusBadge components with placeholder links
provides:
  - Pin detail page at /pins/$pinId with full-size image and metadata card
  - EditPinDialog with title, description, board, and status fields
  - DeletePinDialog with image cleanup warning
  - PinsList integrated into project detail page (replaces placeholder)
  - Pin title and card links navigate to pin detail page
affects: [05-ai-metadata, 06-calendar, 07-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["detail-page-with-sub-components", "error-alert-with-status-reset", "status-dropdown-with-phase-gating"]

# File tracking
key-files:
  created:
    - src/routes/_authed/pins/$pinId.tsx
    - src/components/pins/edit-pin-dialog.tsx
    - src/components/pins/delete-pin-dialog.tsx
    - src/components/ui/alert.tsx
    - src/components/ui/textarea.tsx
  modified:
    - src/routes/_authed/projects/$id.tsx
    - src/components/pins/pins-list.tsx
    - src/components/pins/pin-card.tsx
    - src/routeTree.gen.ts

# Decisions
decisions:
  - id: pin-detail-sub-components
    choice: "Extract PinArticleLink, PinBoardName, and ErrorAlert as local sub-components in the pin detail page"
    why: "Keeps the main component clean while co-locating closely related UI fragments"
  - id: error-reset-to-entwurf
    choice: "Reset Status button sets pin back to 'entwurf' and clears error_message"
    why: "Entwurf is the initial draft state, safest recovery point"
  - id: status-dropdown-phase-gating
    choice: "Phase 4 active statuses and fehler selectable; all future phase statuses visible but disabled"
    why: "Users can see the full workflow, but can only set statuses relevant to current phase"
  - id: view-edit-link-label
    choice: "Dropdown menu item labeled 'View / Edit' instead of just 'Edit'"
    why: "More accurate — the link navigates to pin detail page which has the edit button"

# Metrics
duration: 3.3min
completed: 2026-01-28
tasks: 2/2
---

# Phase 4 Plan 5: Pin Detail, Edit, Delete & Integration Summary

**Full pin CRUD cycle complete: detail page with image display, edit/delete dialogs, error recovery, and project page integration.**

## What Was Built

### Task 1: Pin Detail Page with Edit and Delete Dialogs

**Pin detail page** (`src/routes/_authed/pins/$pinId.tsx`):
- Two-column layout: full-size image (2/3 width) + metadata card (1/3 width)
- Metadata card shows title, description, status badge, linked article, board name, and dates
- Article link navigates to article detail page using `useArticle()` hook
- Board name resolved via `useBoards()` hook
- Error state pins show a red alert box with error message and "Reset Status" button
- Edit and Delete action buttons at bottom of metadata column
- Loading spinner and "Pin not found" error state match existing patterns

**EditPinDialog** (`src/components/pins/edit-pin-dialog.tsx`):
- React Hook Form + Zod validation for title, description, board, and status
- Board select populated from `useBoards(projectId)` with "Not assigned" option
- Status dropdown shows all PIN_STATUS values; Phase 4 active statuses and `fehler` are selectable, future statuses are visible but disabled/greyed
- Pre-fills current pin values when dialog opens
- Uses `useUpdatePin` mutation; closes on success

**DeletePinDialog** (`src/components/pins/delete-pin-dialog.tsx`):
- Confirmation dialog warns that image will also be deleted from storage
- Uses `useDeletePin` mutation (which handles Storage cleanup)
- `onDeleted` callback navigates back to project page

### Task 2: PinsList Integration and Pin Links

- Replaced the placeholder "Pins will appear here" section in project detail page with `<PinsList projectId={id} />`
- Replaced `<span>` placeholder in pins-list.tsx table view with `<Link to="/pins/$pinId">` for pin titles
- Replaced `<div>` placeholder in pin-card.tsx grid view with `<Link to="/pins/$pinId">` wrapping the card content
- Changed dropdown "Edit" item to "View / Edit" link to pin detail page

## Deviations from Plan

### Auto-added Components

**1. [Rule 3 - Blocking] Added shadcn textarea and alert UI components**
- **Found during:** Task 1
- **Issue:** EditPinDialog needs `<Textarea>` and pin error state needs `<Alert>`, neither existed in the component library
- **Fix:** Installed via `npx shadcn@latest add textarea alert`
- **Files created:** `src/components/ui/textarea.tsx`, `src/components/ui/alert.tsx`

**2. [Rule 1 - Bug] Fixed Zod schema type mismatch with React Hook Form**
- **Found during:** Task 1 TypeScript check
- **Issue:** Zod schema with `.optional()` fields produced types incompatible with React Hook Form's `EditPinFormData` (string vs string|undefined)
- **Fix:** Changed schema fields to required strings with empty string defaults, matching the project-dialog pattern
- **Files modified:** `src/components/pins/edit-pin-dialog.tsx`

## Commits

| Hash | Type | Description |
|------|------|-------------|
| d2b22fc | feat | Pin detail page with edit and delete dialogs |
| 194ef99 | feat | Integrate PinsList into project page and wire pin detail links |

## Next Phase Readiness

Phase 4 is now **complete** (5/5 plans). The full pin CRUD cycle is operational:
- Create pins (04-03) with bulk image upload
- List pins (04-04) with table/grid views, status tabs, bulk actions
- View pin detail (04-05) with full-size image and metadata
- Edit pin metadata/status (04-05) with Phase 4 status gating
- Delete pins (04-05) with image storage cleanup

Ready to proceed to Phase 5 (AI Metadata Generation).
