# Expandable Table Rows with Quick Actions

**Date:** 2026-03-08
**Status:** Approved

## Problem

Users find it inconvenient to schedule pins because they must either:
1. Navigate to the pin detail view to set a planning date
2. Use drag-and-drop in the calendar view

This friction slows down bulk planning workflows.

## Solution

Add expandable rows to the pins table. When expanded, users see pin metadata (title, description, alt text) and can perform quick actions (change status, set scheduled date) without leaving the table view.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Expansion behavior | Single row only | Keeps UI clean and focused |
| Component | shadcn Accordion | User preference; good a11y defaults |
| Content display | Read-only | Simpler UX; editing still via detail view |
| Date picker | Date + time | Matches existing scheduling experience |

## Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│ ▶ [Row: image | title | article | status | ... | actions]   │
├─────────────────────────────────────────────────────────────┤
│  EXPANDED CONTENT (when open):                              │
│  ┌──────────────────────────────┬──────────────────────────┐│
│  │ Title: "10 Best Kitchen..."  │ Status: [Dropdown ▾]     ││
│  │ Description: "Discover..."   │                          ││
│  │ Alt Text: "Kitchen gadgets"  │ Schedule: [Date] [Time]  ││
│  │                              │           [Set] [Clear]  ││
│  └──────────────────────────────┴──────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/ui/accordion.tsx` | Create | Install shadcn accordion |
| `src/components/pins/pin-row-expansion.tsx` | Create | Expanded content component |
| `src/components/pins/pin-data-table.tsx` | Modify | Wrap table in Accordion |

## Data Flow

1. **Expansion state**: Managed by Accordion (`type="single" collapsible`), value = pin ID
2. **Status updates**: Reuse `useUpdatePin()` hook → `updatePin.mutate({ id, status })`
3. **Scheduling**: Reuse date/time logic from `schedule-pin-section.tsx`
4. **Realtime**: Existing `useRealtimeInvalidation()` handles live updates

### Status Dropdown

Only shows `ACTIVE_STATUSES`:
- `draft`
- `generate_metadata`
- `metadata_created`

System-managed statuses (generating_metadata, published, error) are not selectable.

### Scheduling Rules

- Disabled if pin lacks title or description
- Past dates blocked
- Preset times: 6:00, 9:00, 12:00, 15:00, 18:00, 21:00
- Custom time input available

## Visual Design

### Expand Trigger
- Chevron icon at row start (before checkbox)
- Rotates 90° when expanded
- Click anywhere on row header to toggle (except checkboxes, buttons)

### Expanded Panel
- Background: `bg-muted/50`
- Layout: 2-column grid (metadata left, actions right)
- Border: subtle separator from next row
- Responsive: stacks vertically on mobile

### Loading States
- Status dropdown shows spinner while updating
- Date/time picker disabled during mutation
- Success feedback via Sonner toast

## Verification

1. Expand a row → metadata (title, description, alt text) displays correctly
2. Change status → mutation fires, row updates, toast confirms
3. Set date/time → scheduled_at updates, calendar reflects change
4. Expand another row → previous row collapses
5. Pin without metadata → scheduling controls disabled with message
6. Responsive: test on mobile viewport → layout stacks correctly
