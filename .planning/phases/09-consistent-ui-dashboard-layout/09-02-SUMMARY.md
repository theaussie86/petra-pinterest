---
phase: 09-consistent-ui-dashboard-layout
plan: 02
subsystem: layout-migration
tags: [route-migration, sidebar-layout, page-layout, dashboard, calendar]
dependency_graph:
  requires:
    - 09-01-shared-layout-components
  provides:
    - sidebar-enabled-authed-layout
    - dashboard-pagelayout-migration
    - calendar-pagelayout-migration
  affects:
    - all-authed-routes
tech_stack:
  added: []
  patterns:
    - SidebarProvider wrapping all authenticated routes
    - PageLayout with CVA variants for responsive container widths
    - PageHeader for consistent page titles
    - Custom loading states preserved where needed (calendar grid skeleton)
key_files:
  created: []
  modified:
    - src/routes/_authed.tsx
    - src/routes/_authed/dashboard.tsx
    - src/routes/_authed/calendar.tsx
decisions:
  - decision: "Calendar keeps custom grid skeleton instead of PageLayout isLoading"
    rationale: "Calendar has a specialized loading skeleton that matches the calendar grid layout (7-column header + 42 cells)"
    alternatives: ["Use PageLayout isLoading with generic spinner"]
    chosen: "Keep custom skeleton"
    impact: "Calendar loading state provides better UX with grid skeleton vs generic spinner"
metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_created: 0
  files_modified: 3
  completed_at: "2026-02-09T21:08:17Z"
---

# Phase 09 Plan 02: Dashboard & Project Routes Migration Summary

**Wired sidebar layout into _authed route and migrated Dashboard and Calendar pages to use PageLayout and PageHeader, eliminating all inline page wrapper code and Header imports.**

## Objective Review

Successfully integrated the shared layout components from Plan 01 into the application shell and two major route files. The _authed layout now provides the sidebar navigation structure for all authenticated routes, while Dashboard and Calendar pages use PageLayout for consistent container widths and standardized loading/error states.

## Tasks Completed

### Task 1: Wire SidebarProvider and AppSidebar into _authed.tsx layout
**Commit:** 99abac5

**What was built:**
- Modified `_authed.tsx` to wrap all authenticated routes with SidebarProvider
- Created named `AuthedLayout` component function replacing inline arrow function
- Rendered AppSidebar with user data from route context
- Wrapped Outlet in SidebarInset for proper content area margin offset

**Key changes:**
- Added imports: `SidebarProvider`, `SidebarInset` from `@/components/ui/sidebar`, `AppSidebar` from `@/components/layout/app-sidebar`
- Component structure: `SidebarProvider > AppSidebar + SidebarInset > Outlet`
- Route context access via `Route.useRouteContext()` to pass user to AppSidebar
- beforeLoad function unchanged — still performs auth guard and passes user via route context

**Technical implementation:**
- SidebarInset provides the `min-h-screen` background and left margin offset, so child routes no longer need page wrapper divs
- All authenticated routes now render inside the sidebar layout automatically
- Sidebar shows Dashboard and Calendar navigation items with active state highlighting

### Task 2: Migrate Dashboard and Calendar routes to PageLayout
**Commit:** 67f6b87

**Dashboard (`src/routes/_authed/dashboard.tsx`):**
- Removed `Header` import from `@/components/layout/header`
- Added `PageLayout` and `PageHeader` imports
- Removed `const { user } = Route.useRouteContext()` line (user only needed for Header, which is removed)
- Replaced outer `<div className="min-h-screen bg-slate-50">`, `<Header user={user} />`, and `<main className="container mx-auto px-4 py-8">` wrapper
- New structure: `<PageHeader title="Dashboard" />` + `<PageLayout maxWidth="wide" isLoading={...} error={...} onRetry={...}>`
- Removed inline loading spinner (`<div className="flex items-center justify-center py-12">...`) — PageLayout handles this
- Removed inline error state — PageLayout handles this
- Removed `{!isLoading && !error && (...)}` conditional wrapping — PageLayout only renders children when not loading and no error
- Kept "Your Projects" as inline section heading (different from page title)
- Dialogs remain outside PageLayout for proper z-index stacking

**Calendar (`src/routes/_authed/calendar.tsx`):**
- Removed `Header` import from `@/components/layout/header`
- Added `PageLayout` and `PageHeader` imports
- Removed `const { user } = Route.useRouteContext()` line
- Removed outer `<div className="min-h-screen bg-slate-50">`, `<Header user={user} />` wrapper
- New structure: `<PageHeader title="Calendar" />` + `<PageLayout maxWidth="wide" className={cn(selectedPinId && "mr-[350px]")}>`
- Applied `mr-[350px]` via PageLayout className prop when pin sidebar is open (instead of on container div)
- **Did NOT use PageLayout's isLoading prop** — Calendar has custom grid skeleton (7-column header + 42 cells) that provides better UX than generic spinner
- Pin sidebar stays outside PageLayout, positioned fixed on right
- All existing calendar functionality intact: filters, status chips, view toggle, drag-and-drop, pin sidebar interaction

## Deviations from Plan

None — plan executed exactly as written. Both routes migrated cleanly to the new layout components without any blocking issues or architectural changes needed.

## Verification Results

All verification criteria met:

- ✅ `npx tsc --noEmit` passes with no type errors in modified files
- ✅ `npm run build` succeeds (6.34s build time)
- ✅ `grep "Header"` in dashboard.tsx and calendar.tsx — no matches (only PageHeader and inline comments)
- ✅ `grep "min-h-screen bg-slate-50"` in dashboard.tsx and calendar.tsx — no matches
- ✅ `grep "PageLayout\|PageHeader"` confirms both components imported and used in both files
- ✅ _authed.tsx renders `SidebarProvider > AppSidebar + SidebarInset > Outlet`
- ✅ Dashboard uses `<PageHeader title="Dashboard" />` and `<PageLayout maxWidth="wide">`
- ✅ Calendar uses `<PageHeader title="Calendar" />` and `<PageLayout maxWidth="wide">`

## Success Criteria

✅ _authed.tsx provides the sidebar shell for all authenticated routes. Dashboard and Calendar are fully migrated to use PageLayout and PageHeader with no duplicate wrapper code. Dashboard loading/error states handled by PageLayout; Calendar retains custom grid skeleton for better UX.

## Key Decisions

**1. Calendar keeps custom grid skeleton instead of using PageLayout isLoading**
- **Context:** PageLayout supports centralized loading state with LoadingSpinner component, but Calendar has a specialized 7-column grid skeleton
- **Decision:** Do not pass `isLoading` to PageLayout for calendar page; keep existing custom skeleton
- **Rationale:** Calendar grid skeleton (7-column header + 42 cells) provides superior user experience by matching the actual calendar layout structure; generic spinner would be jarring and less informative
- **Impact:** Calendar loading state remains inline but provides better visual feedback; PageLayout still handles container width and pin sidebar margin offset via className prop

## Dependencies

### Requires
- `09-01-shared-layout-components` — PageLayout, PageHeader, AppSidebar, SidebarProvider/SidebarInset components

### Provides
- `sidebar-enabled-authed-layout` — All authenticated routes render inside sidebar layout
- `dashboard-pagelayout-migration` — Dashboard page uses PageLayout pattern
- `calendar-pagelayout-migration` — Calendar page uses PageLayout pattern

### Affects
- Plan 03 (Project Routes Migration) — Will follow same pattern for project detail and related pages
- All future authenticated routes — Can use the sidebar layout automatically by placing route under `_authed/`

## Next Steps

Ready for Plan 03 (Project Routes Migration), which will migrate the project detail page and related routes (articles, pins) to use PageLayout and PageHeader with breadcrumb navigation.

## Self-Check

Verifying all modified files exist:

- ✅ FOUND: src/routes/_authed.tsx
- ✅ FOUND: src/routes/_authed/dashboard.tsx
- ✅ FOUND: src/routes/_authed/calendar.tsx

Verifying commits exist:

- ✅ FOUND: 99abac5 (Task 1: wire SidebarProvider and AppSidebar into _authed layout)
- ✅ FOUND: 67f6b87 (Task 2: migrate Dashboard and Calendar routes to PageLayout)

## Self-Check: PASSED
