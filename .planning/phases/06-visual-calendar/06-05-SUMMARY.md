---
phase: 06-visual-calendar
plan: 05
subsystem: ui
tags: [react-hook-form, radix-ui, controlled-components, form-validation]

# Dependency graph
requires:
  - phase: 06-03
    provides: Pin sidebar inline editing with board selection
provides:
  - Consistent __none__ sentinel pattern for unassigned board_id in form state
  - Sentinel-to-null conversion only at submission boundary
  - Actual error messages in all pin mutation toasts
affects: [future-forms, error-handling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controlled component sentinel value consistency - form state uses same values as Select options"
    - "Error message surfacing in mutation hooks - all onError handlers accept Error parameter and display error.message"

key-files:
  created: []
  modified:
    - src/components/calendar/pin-sidebar.tsx
    - src/components/pins/edit-pin-dialog.tsx
    - src/lib/hooks/use-pins.ts

key-decisions:
  - "Use __none__ sentinel consistently in form state, not empty string - prevents controlled component value mismatch"
  - "Convert sentinel to null only at submission boundary - keeps conversion logic localized to onSubmit"
  - "Surface actual error messages in all mutation hooks - enables debugging of RLS, constraints, and other database errors"

patterns-established:
  - "Sentinel value pattern: Form state uses same sentinel value that exists in Select options, conversion to null happens in onSubmit"
  - "Error message pattern: All mutation hooks accept error parameter and include error.message in toast for debugging"

# Metrics
duration: 2.0min
completed: 2026-02-09
---

# Phase 6 Plan 5: Board Select Fix Summary

**Fixed controlled component value mismatch in board selection by using __none__ sentinel consistently in form state and surfacing actual error messages across all pin mutations**

## Performance

- **Duration:** 2.0 min
- **Started:** 2026-02-09T12:51:46Z
- **Completed:** 2026-02-09T12:53:46Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Board selection in sidebar inline editing now works without "Failed to update pin" errors
- Edit pin dialog board selection fixed with identical pattern for consistency
- All 7 pin mutation hooks now display actual Supabase error messages instead of generic failure text

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix board_id sentinel mismatch in pin-sidebar.tsx** - `426c329` (fix)
2. **Task 2: Fix board_id sentinel mismatch in edit-pin-dialog.tsx** - `e2cb53d` (fix)
3. **Task 3: Surface actual error messages in useUpdatePin toast** - `6d94ee7` (fix)

## Files Created/Modified
- `src/components/calendar/pin-sidebar.tsx` - Changed board_id initialization to use '__none__' sentinel, convert to null only in onSubmit
- `src/components/pins/edit-pin-dialog.tsx` - Applied identical fix for consistency across edit flows
- `src/lib/hooks/use-pins.ts` - Added error parameter to all 7 mutation onError handlers, display error.message in toasts

## Decisions Made

**Sentinel value consistency for controlled Radix UI Select components:**
- Form state must use the same sentinel value ('__none__') that exists in SelectItem options
- Conversion to null only happens at submission boundary (onSubmit), not during onValueChange
- This prevents controlled component value mismatches that cause form updates to fail

**Error message surfacing pattern:**
- All mutation hooks should accept `error: Error` parameter in onError handlers
- Toast messages should include `${error.message}` for debugging database constraints, RLS errors, etc.
- Generic "Failed to..." messages hide critical debugging information

## Deviations from Plan

None - plan executed exactly as written. This was a gap closure plan addressing UAT issue #8.

## Issues Encountered

None - root cause was clearly identified in the plan, fixes applied cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 6 (Visual Calendar) now complete with this gap closure:
- Calendar grid with drag-and-drop scheduling
- Unscheduled pins table with bulk scheduling
- Pin detail sidebar with inline editing (now working correctly)
- Board selection works in both sidebar and edit dialog
- Error messages are debuggable across all pin operations

Ready for Phase 7 (Airtable Migration & Production Launch).

## Self-Check: PASSED

**Files verified:**
- ✓ src/components/calendar/pin-sidebar.tsx
- ✓ src/components/pins/edit-pin-dialog.tsx
- ✓ src/lib/hooks/use-pins.ts
- ✓ .planning/phases/06-visual-calendar/06-05-SUMMARY.md

**Commits verified:**
- ✓ 426c329 (Task 1: pin-sidebar.tsx)
- ✓ e2cb53d (Task 2: edit-pin-dialog.tsx)
- ✓ 6d94ee7 (Task 3: use-pins.ts error messages)

All files exist, all commits present in git history.

---
*Phase: 06-visual-calendar*
*Completed: 2026-02-09*
