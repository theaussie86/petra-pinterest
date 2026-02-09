---
phase: 06-visual-calendar
plan: 04
subsystem: calendar
tags: [drag-drop, unscheduled-pins, bulk-scheduling, ux]
dependency_graph:
  requires: [06-03, bulk-schedule-dialog]
  provides: [calendar-rescheduling, unscheduled-pins-table]
  affects: [calendar-grid, calendar-day-cell]
tech_stack:
  added: [html5-drag-drop-api, react-memo-custom-comparison]
  patterns: [drag-and-drop, optimistic-rendering, shared-filter-state]
key_files:
  created:
    - src/components/calendar/unscheduled-pins-list.tsx
  modified:
    - src/components/calendar/calendar-day-cell.tsx
    - src/components/calendar/calendar-grid.tsx
    - src/routes/_authed/calendar.tsx
decisions:
  - decision: "Use native HTML5 Drag and Drop API instead of external library"
    rationale: "Simple drag-between-cells interaction doesn't warrant library overhead"
    alternatives: ["react-dnd", "dnd-kit"]
  - decision: "Memoize CalendarDayCell with custom comparison function"
    rationale: "Prevents unnecessary re-renders during drag operations by comparing only pin count and IDs, not full pin objects"
    alternatives: ["Deep equality check", "No memoization"]
  - decision: "Show project name instead of article title in unscheduled list"
    rationale: "Unscheduled pins come from all projects, avoiding per-project useArticles queries keeps it efficient"
    alternatives: ["Fetch all articles upfront", "Show article title with loading state"]
  - decision: "Clear selection after bulk schedule dialog closes"
    rationale: "Consistent with bulk scheduling UX - pins move out of unscheduled view, selection becomes stale"
    alternatives: ["Keep selection", "Clear only on success"]
metrics:
  duration: 218s
  tasks_completed: 2
  files_created: 1
  files_modified: 3
  commits: 2
  completed_date: 2026-02-09
---

# Phase 6 Plan 04: Drag-and-Drop Rescheduling & Unscheduled Pins Summary

Drag-and-drop calendar rescheduling with HTML5 API plus unscheduled pins table with bulk scheduling integration.

## What Was Built

### Task 1: Drag-and-Drop Rescheduling
Implemented HTML5 drag-and-drop for pin thumbnails within calendar cells, allowing users to reschedule pins by dragging between days.

**CalendarDayCell enhancements:**
- Made pin thumbnails draggable with `draggable` attribute and drag event handlers
- Visual feedback during drag: reduced opacity (50%) on dragged thumbnail, blue ring + background highlight on drop target
- Drop target handlers with proper event handling (preventDefault, stopPropagation, relatedTarget checks for nested elements)

**CalendarGrid drop handler:**
- `handlePinDrop` extracts pin's existing scheduled time, creates new date with target day + original time
- Calls `useUpdatePin` mutation to update `scheduled_at` in database
- TanStack Query invalidation automatically refreshes both calendar views

**Performance optimization:**
- Memoized `CalendarDayCell` with custom comparison function checking only date, view, and pin count/IDs (not deep equality)
- Prevents unnecessary re-renders during drag operations

### Task 2: Unscheduled Pins Table
Created full-featured table view for unscheduled pins with selection and bulk scheduling.

**UnscheduledPinsList component:**
- Table columns: checkbox, thumbnail (40x40), title (clickable), project name, status badge, created date
- Client-side sorting on title, status, created_at, updated_at (same pattern as PinsList)
- Selection state with toggleSelect/toggleSelectAll handlers
- Bulk schedule button (visible when selection active) opens `BulkScheduleDialog`
- Empty state with CalendarIcon and filter adjustment guidance

**Calendar route integration:**
- Replaced unscheduled tab placeholder with `UnscheduledPinsList` component
- Passed `unscheduledPins` (filtered pins with `scheduled_at === null`) and `handlePinClick` handler
- Shared filter state: project dropdown and status chips filter BEFORE split into scheduled/unscheduled
- Clicking pin title in unscheduled list opens sidebar (same as calendar grid)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification criteria met:

**Drag-and-drop:**
- ✓ Pin thumbnails draggable with visual feedback (reduced opacity)
- ✓ Day cells highlight on drag over (blue ring + bg)
- ✓ Dropping reschedules pin to new date while preserving time
- ✓ Calendar updates immediately via TanStack Query invalidation

**Unscheduled table:**
- ✓ Table shows checkbox, image, title, project, status, created columns
- ✓ Selection works (individual + select all)
- ✓ Bulk schedule dialog opens for selected pins
- ✓ Scheduling pins moves them from unscheduled to calendar view
- ✓ Project and status filters apply to both calendar and unscheduled views
- ✓ Clicking pin title opens sidebar
- ✓ Empty state shows when no unscheduled pins match filters

**TypeScript compilation:**
- ✓ Clean build with no type errors

## Technical Details

**Drag-and-drop implementation:**
```typescript
// Pin thumbnail
<div
  draggable
  onDragStart={(e) => handleDragStart(e, pin)}
  onDragEnd={handleDragEnd}
>
  <img className={draggingPinId === pin.id && 'opacity-50'} />
</div>

// Day cell drop target
<div
  onDragOver={handleDragOver}  // preventDefault + dropEffect='move'
  onDragEnter={handleDragEnter}  // setIsDragOver(true)
  onDragLeave={handleDragLeave}  // relatedTarget check
  onDrop={handleDrop}  // extract pinId, call onPinDrop
  className={isDragOver && 'ring-2 ring-blue-400 bg-blue-50'}
/>

// Reschedule handler
const handlePinDrop = (pinId: string, targetDate: Date) => {
  const pin = pins.find(p => p.id === pinId)
  if (!pin?.scheduled_at) return

  const existingDate = new Date(pin.scheduled_at)
  const newDate = new Date(targetDate)
  newDate.setHours(existingDate.getHours(), existingDate.getMinutes(), 0, 0)

  updatePin.mutate({ id: pinId, scheduled_at: newDate.toISOString() })
}
```

**Custom memo comparison:**
```typescript
export const CalendarDayCell = memo(CalendarDayCellComponent, (prev, next) => {
  if (prev.date.getTime() !== next.date.getTime()) return false
  if (prev.view !== next.view) return false
  if (prev.pins.length !== next.pins.length) return false

  for (let i = 0; i < prev.pins.length; i++) {
    if (prev.pins[i].id !== next.pins[i].id) return false
  }

  return true
})
```

**Shared filter architecture:**
```typescript
// In calendar.tsx
const filteredPins = useMemo(() => {
  let filtered = allPins
  if (project) filtered = filtered.filter(p => p.blog_project_id === project)
  if (statuses) filtered = filtered.filter(p => statuses.includes(p.status))
  return filtered
}, [allPins, project, statuses])

const scheduledPins = filteredPins.filter(p => p.scheduled_at !== null)
const unscheduledPins = filteredPins.filter(p => p.scheduled_at === null)
```

## Files Changed

**Created:**
- `src/components/calendar/unscheduled-pins-list.tsx` (295 lines) - Sortable table view for unscheduled pins with selection and bulk scheduling

**Modified:**
- `src/components/calendar/calendar-day-cell.tsx` - Added drag-and-drop handlers, visual feedback, memoization
- `src/components/calendar/calendar-grid.tsx` - Added `handlePinDrop` handler using `useUpdatePin`, passed to CalendarDayCell
- `src/routes/_authed/calendar.tsx` - Integrated UnscheduledPinsList into unscheduled tab

## Commits

- `a6b3b92` - feat(06-04): add drag-and-drop rescheduling to calendar
- `6675622` - feat(06-04): add unscheduled pins table with bulk scheduling

## Integration Points

**Uses:**
- `useUpdatePin` hook for drag-and-drop reschedule mutation
- `useBlogProjects` hook for project name lookup in unscheduled table
- `BulkScheduleDialog` component from Phase 5 for scheduling selected pins
- TanStack Query invalidation for automatic UI updates

**Provides:**
- Complete calendar interaction model with drag-and-drop rescheduling
- Unscheduled pins management interface with bulk scheduling
- Shared filter state across calendar and unscheduled views

## User Experience Improvements

1. **Intuitive rescheduling** - Drag pins between days instead of opening edit dialog
2. **Visual feedback** - Opacity change on drag, highlight on drop target
3. **Preserved time** - Changing date keeps original time intact
4. **Bulk unscheduled actions** - Select multiple pins and schedule at once
5. **Shared filters** - Consistent filtering across calendar and unscheduled views
6. **Quick navigation** - Click pin in unscheduled table to open sidebar

## Next Steps

Phase 6 complete! All 4 plans implemented:
- 06-01: Calendar foundation with filters
- 06-02: Calendar grid with month/week views
- 06-03: Pin detail sidebar
- 06-04: Drag-and-drop + unscheduled table

Ready for Phase 7: Airtable migration and production launch.

## Self-Check: PASSED

**Created files exist:**
```bash
FOUND: src/components/calendar/unscheduled-pins-list.tsx
```

**Modified files exist:**
```bash
FOUND: src/components/calendar/calendar-day-cell.tsx
FOUND: src/components/calendar/calendar-grid.tsx
FOUND: src/routes/_authed/calendar.tsx
```

**Commits exist:**
```bash
FOUND: a6b3b92
FOUND: 6675622
```

All files and commits verified.
