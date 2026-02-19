# Pin Scheduling Flow

Calendar view with month/week modes, drag-and-drop rescheduling, and an unscheduled pins tab.

## Schedule a Pin

```mermaid
flowchart TD
    A[Open pin sidebar or detail page] --> B[SchedulePinSection]
    B --> C{Has title + description?}
    C -->|No| D[Message: Complete metadata first]
    C -->|Yes| E[Show date + time pickers]

    E --> F[Pick date from calendar popover<br/>past dates disabled]
    F --> G[Pick time:<br/>preset 6/9/12/15/18/21<br/>or custom input]
    G --> H[Click Schedule]
    H --> I[Combine date + time → ISO string]
    I --> J[updatePin: scheduled_at = ISO]
    J --> K[Pin appears on calendar]
```

**Prerequisites:** A pin must have `title` and `description` before it can be scheduled. This ensures metadata is ready before the pin reaches its scheduled publish time.

## Calendar Interactions

```mermaid
flowchart TD
    A[Calendar page] --> B{Tab selection}
    B -->|Calendar tab| C[CalendarGrid]
    B -->|Unscheduled tab| D[UnscheduledPinsList]

    C --> E{View mode}
    E -->|Month| F[Month grid with pin thumbnails]
    E -->|Week| G[Time grid 6AM-10PM with pin blocks]

    F --> H[Click pin → open sidebar]
    F --> I[Drag pin to another day<br/>keeps existing time]
    G --> H
    G --> J[Drag pin to time slot<br/>snaps to 15-min intervals]

    D --> K[Table of unscheduled pins]
    K --> H
```

## Month View Drag & Drop

```mermaid
sequenceDiagram
    actor User
    participant Source as Source Day Cell
    participant Target as Target Day Cell
    participant Grid as CalendarGrid
    participant API as updatePin

    User->>Source: Drag pin thumbnail
    Source->>Source: Set dataTransfer = pin.id
    User->>Target: Drop on target day
    Target->>Grid: onPinDrop(pinId, targetDate)
    Grid->>Grid: Get pin's existing time from scheduled_at
    Grid->>Grid: Combine target date + existing time
    Grid->>API: updatePin({ id, scheduled_at: newISO })
    API-->>Grid: Updated pin
    Grid->>Grid: Invalidate queries, calendar refreshes
```

In month view, the **time is preserved** when dragging to a different day. Each day cell shows up to 6 pin thumbnails with a "+N more" overflow popover.

## Week View Drag & Drop

```mermaid
sequenceDiagram
    actor User
    participant Block as Pin Block
    participant Column as Day Column
    participant Grid as CalendarWeekGrid
    participant API as updatePin

    User->>Block: Drag pin block
    User->>Column: Drop at Y position
    Column->>Grid: Convert Y pixels to time
    Grid->>Grid: Snap to 15-minute intervals
    Grid->>Grid: Create Date with day + snapped time
    Grid->>API: updatePin({ id, scheduled_at: newISO })
    API-->>Grid: Updated pin
```

Week view constants:
- Hours: 6 AM to 10 PM
- Hour height: 60px (1 min ~ 1 px)
- Snap interval: 15 minutes
- Overlapping pins stack side-by-side with calculated widths

## Unschedule a Pin

```mermaid
flowchart LR
    A[Pin sidebar: Schedule section] --> B[Click 'Clear Schedule']
    B --> C[updatePin: scheduled_at = null]
    C --> D[Pin removed from calendar]
    D --> E[Pin appears in Unscheduled tab]
```

## Unscheduled Pins Tab

A table view of all pins without a `scheduled_at` value:

- **Sortable by:** title, status, created_at, updated_at
- **Columns:** thumbnail, title, project name, status badge, created date
- **Click row:** Opens pin sidebar for editing/scheduling
- **Bulk selection:** Checkbox selection available (scaffold for future bulk actions)

## Calendar Navigation

- **Month/Week toggle:** Switch between views (persisted in URL search params)
- **Prev/Next:** Navigate by month or week
- **Today:** Jump to current date
- **Status filters:** Toggle which pin statuses are visible (persisted in URL)
- **Current time indicator:** Red line in week view, updates every 60 seconds

## Realtime Updates

The calendar page subscribes to Supabase Realtime for UPDATE events on the `pins` table (filtered by `blog_project_id`). Any pin change—from the sidebar, detail page, or auto-publish—triggers a cache invalidation and re-render.

## Key Files

| File | Purpose |
|------|---------|
| `src/routes/_authed/projects/$projectId/calendar.tsx` | Calendar page with tabs, filters, sidebar |
| `src/components/calendar/calendar-grid.tsx` | Month/week grid selection, drag-drop coordination |
| `src/components/calendar/calendar-header.tsx` | Navigation controls, view toggle |
| `src/components/calendar/calendar-day-cell.tsx` | Day cell with pin thumbnails, drag source/target |
| `src/components/calendar/calendar-week-grid.tsx` | Time grid, pixel-to-time conversion, overlap layout |
| `src/components/calendar/pin-sidebar.tsx` | Right-side panel for pin editing/scheduling |
| `src/components/calendar/unscheduled-pins-list.tsx` | Table of unscheduled pins with sorting |
| `src/components/pins/schedule-pin-section.tsx` | Date/time picker with presets |
