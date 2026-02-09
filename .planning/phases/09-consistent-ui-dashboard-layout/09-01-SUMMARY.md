---
phase: 09-consistent-ui-dashboard-layout
plan: 01
subsystem: ui-foundation
tags: [shadcn, layout-components, sidebar, accessibility]
dependency_graph:
  requires: []
  provides:
    - shared-layout-components
    - sidebar-primitives
    - breadcrumb-primitives
    - loading-error-states
  affects:
    - all-route-migrations
tech_stack:
  added:
    - shadcn/ui-sidebar
    - shadcn/ui-breadcrumb
    - class-variance-authority
  patterns:
    - CVA container variants for responsive layouts
    - Accessible loading/error states with ARIA attributes
    - Reusable page header with breadcrumb navigation
    - Sidebar-based navigation with user menu
key_files:
  created:
    - src/components/ui/sidebar.tsx
    - src/components/ui/breadcrumb.tsx
    - src/components/ui/separator.tsx
    - src/components/ui/sheet.tsx
    - src/components/ui/skeleton.tsx
    - src/hooks/use-mobile.tsx
    - src/components/layout/loading-spinner.tsx
    - src/components/layout/error-state.tsx
    - src/components/layout/page-layout.tsx
    - src/components/layout/page-header.tsx
    - src/components/layout/app-sidebar.tsx
  modified:
    - src/styles.css
    - package.json
    - package-lock.json
decisions:
  - decision: "Remove tw-animate-css import from styles.css"
    rationale: "shadcn CLI added @import 'tw-animate-css' but package not installed, blocking build"
    alternatives: ["Install tw-animate package", "Leave broken import"]
    chosen: "Remove import"
    impact: "Build succeeds; Sidebar animations use native CSS without external dependency"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_created: 11
  files_modified: 3
  completed_at: "2026-02-09T21:03:00Z"
---

# Phase 09 Plan 01: Shared Layout Components Foundation Summary

**Installed shadcn/ui Sidebar and Breadcrumb components, created shared layout foundation with LoadingSpinner, ErrorState, PageLayout (CVA variants), PageHeader (breadcrumbs), and AppSidebar (navigation + user menu).**

## Objective Review

Successfully established the foundation layer for UI consistency by installing shadcn/ui primitives and creating all shared layout components. These 7 new components replace 11 instances of duplicate page wrapper code and 5 inconsistent loading/error implementations across the codebase.

## Tasks Completed

### Task 1: Install shadcn/ui Sidebar and Breadcrumb, create LoadingSpinner and ErrorState
**Commit:** b320809

**What was built:**
- Installed shadcn/ui Sidebar component with all primitives (SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarRail, SidebarTrigger)
- Installed shadcn/ui Breadcrumb component (Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage)
- Created LoadingSpinner component with accessible `role="status"` and sr-only text for screen readers
- Created ErrorState component with error message display, AlertCircle icon, and optional retry button

**Key files:**
- `src/components/ui/sidebar.tsx` — shadcn/ui Sidebar primitives
- `src/components/ui/breadcrumb.tsx` — shadcn/ui Breadcrumb primitives
- `src/components/layout/loading-spinner.tsx` — Accessible loading spinner with ARIA attributes
- `src/components/layout/error-state.tsx` — Error state with message and retry button

**Supporting files added:**
- `src/components/ui/separator.tsx` — Separator primitive used by PageHeader
- `src/components/ui/sheet.tsx` — Sheet primitive (dependency of Sidebar)
- `src/components/ui/skeleton.tsx` — Skeleton primitive (dependency of Sidebar)
- `src/hooks/use-mobile.tsx` — Mobile detection hook for responsive Sidebar behavior

### Task 2: Create PageLayout, PageHeader, and AppSidebar components
**Commit:** 1d3926c

**What was built:**
- Created PageLayout component with CVA-based container variants (narrow: max-w-3xl, medium: max-w-5xl, wide: max-w-7xl, full: no max-width)
- PageLayout conditionally renders LoadingSpinner when `isLoading=true` and ErrorState when `error` is provided
- Created PageHeader component with SidebarTrigger, Breadcrumb navigation, title, optional description, and action buttons
- Created AppSidebar component with Dashboard and Calendar navigation items, active state highlighting, and user dropdown menu in footer
- AppSidebar footer shows user avatar (initials), display name, email, and sign-out option

**Key files:**
- `src/components/layout/page-layout.tsx` — Reusable page wrapper with CVA container variants and loading/error states
- `src/components/layout/page-header.tsx` — Page header with breadcrumbs, title, description, and actions
- `src/components/layout/app-sidebar.tsx` — Application sidebar with navigation and user menu

**Technical implementation:**
- PageLayout uses `cn()` utility for className composition, allowing calendar page to add `mr-[350px]` for pin sidebar offset
- PageHeader renders breadcrumbs with TanStack Router Link components for type-safe navigation
- AppSidebar uses DropdownMenu for user menu, matching existing pattern from header.tsx
- Initials computation follows existing pattern: split display name by space, take first char of each word, uppercase, slice to 2 chars

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed broken tw-animate-css import blocking build**
- **Found during:** Task 2 build verification
- **Issue:** shadcn CLI added `@import "tw-animate-css";` to styles.css during Sidebar installation, but package not installed in project. Build failed with "Can't resolve 'tw-animate-css'" error.
- **Fix:** Removed the problematic import line from styles.css. Sidebar animations work correctly with native Tailwind CSS without external dependency.
- **Files modified:** `src/styles.css`
- **Commit:** 1d3926c (included with Task 2)
- **Rationale:** Installing an additional animation package was unnecessary complexity; Tailwind CSS v4 provides all needed animation utilities. Removing the import was the simplest fix that unblocked Task 2 verification.

## Verification Results

All verification criteria met:

- ✅ `npx tsc --noEmit` passes with no errors from new components
- ✅ `npm run build` succeeds after tw-animate-css import fix
- ✅ All 7 new component files exist in correct locations
- ✅ shadcn/ui sidebar.tsx and breadcrumb.tsx installed in `src/components/ui/`
- ✅ LoadingSpinner has `role="status"` attribute for accessibility
- ✅ ErrorState accepts error prop and optional onRetry callback
- ✅ PageLayout uses CVA with 4 maxWidth variants (narrow/medium/wide/full)
- ✅ PageHeader renders SidebarTrigger and Breadcrumb components with TanStack Router Link integration
- ✅ AppSidebar has Dashboard + Calendar nav items with signOut in footer dropdown

## Success Criteria

✅ All shared layout components are created, type-checked, and ready for consumption by Plans 02 and 03. No existing routes are modified yet — this plan is purely additive.

## Key Decisions

**1. Remove tw-animate-css import instead of installing package**
- **Context:** shadcn CLI automatically added CSS import for animation package during Sidebar installation
- **Decision:** Remove the import rather than install tw-animate
- **Rationale:** Tailwind CSS v4 provides comprehensive animation utilities; external package adds unnecessary dependency and bundle size
- **Impact:** Clean build without additional dependencies; Sidebar animations work correctly with built-in Tailwind utilities

## Dependencies

### Requires
- None (foundation layer)

### Provides
- `shared-layout-components` — Reusable layout components for all routes
- `sidebar-primitives` — shadcn/ui Sidebar component system
- `breadcrumb-primitives` — shadcn/ui Breadcrumb navigation
- `loading-error-states` — Accessible loading and error state components

### Affects
- Plans 02 and 03 — Will consume these components for route migrations
- All future route implementations — Can use these standardized layout patterns

## Next Steps

Ready for Plan 02 (Dashboard & Project Routes Migration), which will integrate these components into existing dashboard and project pages.

## Self-Check

Verifying all created files exist:

- ✅ FOUND: src/components/ui/sidebar.tsx
- ✅ FOUND: src/components/ui/breadcrumb.tsx
- ✅ FOUND: src/components/ui/separator.tsx
- ✅ FOUND: src/components/ui/sheet.tsx
- ✅ FOUND: src/components/ui/skeleton.tsx
- ✅ FOUND: src/hooks/use-mobile.tsx
- ✅ FOUND: src/components/layout/loading-spinner.tsx
- ✅ FOUND: src/components/layout/error-state.tsx
- ✅ FOUND: src/components/layout/page-layout.tsx
- ✅ FOUND: src/components/layout/page-header.tsx
- ✅ FOUND: src/components/layout/app-sidebar.tsx

Verifying commits exist:

- ✅ FOUND: b320809 (Task 1: shadcn/ui components and LoadingSpinner/ErrorState)
- ✅ FOUND: 1d3926c (Task 2: PageLayout, PageHeader, AppSidebar)

## Self-Check: PASSED
