# Phase 6: Visual Calendar - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can view and interact with scheduled pins on a visual calendar interface. Includes filtering by project and status, a sidebar for pin editing, and a separate section for unscheduled pins. Drag-and-drop rescheduling within the calendar. No new pin creation, metadata generation, or publishing workflows — those exist in prior phases.

</domain>

<decisions>
## Implementation Decisions

### Calendar layout & navigation
- Two views: Month and Week, toggleable
- Month view: grid with pin thumbnails in cells, status-colored indicators on each thumbnail
- Week view: 7 larger day columns (no hourly time slots), more space per day for thumbnails
- Overflow: show as many thumbnails as fit, then "+N more" badge that opens a popover/list for that day
- Standard calendar navigation (prev/next month/week, today button)

### Pin interaction & sidebar
- Clicking a pin opens a right sidebar (~350px narrow)
- Sidebar supports full editing: title, description, schedule, status, board, image re-upload, metadata regeneration — everything from the detail page
- Sidebar is scrollable for all fields in compact layout
- Calendar remains visible and interactive while sidebar is open
- Drag-and-drop rescheduling: drag a pin from one day to another to change scheduled date (keeps same time)

### Filtering & project context
- Blog project filter: single dropdown above calendar — "All projects" or select one project
- Status filter: toggle chips — multiple statuses can be active simultaneously
- Pin thumbnails color-coded by status (e.g., green = published, yellow = scheduled, red = error)
- Filters persist via URL params — bookmarkable and survives refresh

### Unscheduled pins handling
- Separate tab/section on the calendar page — toggle between "Calendar" and "Unscheduled" views (not simultaneous)
- Unscheduled section displays pins in a table list (sortable columns: image, title, article, status)
- Bulk scheduling available using the existing Phase 5 bulk schedule dialog (select pins, pick date/time)
- Shared filters: same project dropdown and status chips apply to both calendar and unscheduled views

### Claude's Discretion
- Calendar library choice and implementation approach
- Exact drag-and-drop library and interaction feel
- Thumbnail sizing and responsive breakpoints
- Loading states and skeleton patterns
- "+N more" popover design
- Sidebar transition animation
- Status color palette mapping
- Performance optimization strategy for 1000+ pins

</decisions>

<specifics>
## Specific Ideas

- Pin thumbnails with status-colored borders/badges — combining visual thumbnail preview with at-a-glance status information
- Week view is "zoomed-in month" — same concept, more space per day, not an hourly time grid
- Unscheduled section reuses familiar table pattern from project detail pages for consistency

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-visual-calendar*
*Context gathered: 2026-02-09*
