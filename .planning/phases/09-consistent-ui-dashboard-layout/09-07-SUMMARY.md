---
phase: 09-consistent-ui-dashboard-layout
plan: 07
subsystem: routing
tags: [nested-routes, routing, breadcrumbs, navigation, gap-closure]
dependency_graph:
  requires: [09-05-sidebar-layout-gap-closure]
  provides: [nested-article-routes, nested-pin-routes, project-hierarchy-breadcrumbs]
  affects: [article-detail-page, pin-detail-page, article-navigation, pin-navigation, calendar-sidebar]
tech_stack:
  added: []
  patterns: [nested-file-based-routes, tanstack-router-params, breadcrumb-hierarchy]
key_files:
  created:
    - src/routes/_authed/projects/$projectId/articles/$articleId.tsx
    - src/routes/_authed/projects/$projectId/pins/$pinId.tsx
  modified:
    - src/components/articles/articles-table.tsx
    - src/components/calendar/pin-sidebar.tsx
    - src/components/pins/pin-card.tsx
    - src/components/pins/pins-list.tsx
  deleted:
    - src/routes/_authed/articles/$articleId.tsx
    - src/routes/_authed/pins/$pinId.tsx
decisions: []
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 6
  commits: 2
  completed_date: 2026-02-10
---

# Phase 09 Plan 07: Nested Route Structure Summary

**One-liner:** Article and pin detail pages moved to nested routes under projects with full 3-level breadcrumb hierarchy (Dashboard > Project > Entity).

## What Was Done

### Task 1: Move Route Files to Nested Paths (Commit: 45e9659)

**Created nested route structure:**
- `src/routes/_authed/projects/$projectId/articles/$articleId.tsx` - Article detail page with projectId parameter
- `src/routes/_authed/projects/$projectId/pins/$pinId.tsx` - Pin detail page with projectId parameter

**Key changes in nested routes:**
- Both routes extract `projectId` and entity ID from `Route.useParams()`
- Added `useBlogProject(projectId)` hook call to fetch project name for breadcrumbs
- Updated breadcrumbs from 2-level to 3-level hierarchy:
  - Old: `Dashboard > Article/Pin`
  - New: `Dashboard > [Project Name] > Article/Pin`
- Breadcrumb project link uses template literal: `` href: `/projects/${projectId}` ``
- PinArticleLink sub-component receives `projectId` prop for nested article navigation

**Deleted flat routes:**
- `src/routes/_authed/articles/$articleId.tsx`
- `src/routes/_authed/pins/$pinId.tsx`
- Removed empty directories after deletion

**Route tree auto-regenerated:**
- TanStack Router detected file changes and regenerated `src/routeTree.gen.ts`
- New routes: `/_authed/projects/$projectId/articles/$articleId` and `/_authed/projects/$projectId/pins/$pinId`
- Old flat routes removed from route tree
- No manual route tree editing required

### Task 2: Update All Navigation Links (Commit: 764c1dc)

**Updated 7 link locations across 4 component files:**

1. **articles-table.tsx (1 link):**
   - Changed: `to="/articles/$articleId"` → `to="/projects/$projectId/articles/$articleId"`
   - Params: `{ articleId }` → `{ projectId, articleId }`

2. **pins-list.tsx (3 links):**
   - Table view title link (line ~444)
   - Dropdown "View / Edit" link (line ~479)
   - Both updated with: `to="/projects/$projectId/pins/$pinId"` and `params={{ projectId, pinId }}`

3. **pin-card.tsx (1 link):**
   - Uses `pin.blog_project_id` directly (already available on Pin type)
   - Updated to: `to="/projects/$projectId/pins/$pinId"` with `params={{ projectId: pin.blog_project_id, pinId }}`
   - No interface changes required

4. **pin-sidebar.tsx (2 links):**
   - Article link: `to="/projects/$projectId/articles/$articleId"` with `params={{ projectId: pin.blog_project_id, articleId }}`
   - Pin detail "Open Full Detail" link: `to="/projects/$projectId/pins/$pinId"` with `params={{ projectId: pin.blog_project_id, pinId }}`
   - Added `pin &&` guard to article link condition for `blog_project_id` access

**Verification:**
- `grep` search confirms 0 flat route references remain (excluding auto-generated routeTree.gen.ts)
- `npm run build` passed with no TypeScript errors
- All params properly typed and passed

## Deviations from Plan

None - plan executed exactly as written.

## UAT Gaps Closed

**Test 7 - Article Detail URL Structure:**
- ✅ Article detail pages now at `/projects/{projectId}/articles/{articleId}`
- ✅ Breadcrumbs show "Dashboard > [Project Name] > [Article Title]"

**Test 8 - Pin Detail URL Structure:**
- ✅ Pin detail pages now at `/projects/{projectId}/pins/{pinId}`
- ✅ Breadcrumbs show "Dashboard > [Project Name] > [Pin Title]"

## Technical Details

### TanStack Router File-Based Routing Pattern

- Directory structure `projects/$projectId/articles/$articleId.tsx` creates route path `/projects/:projectId/articles/:articleId`
- `$` prefix denotes dynamic segments
- `_authed` prefix is a layout route (pathless), so full URL excludes `_authed` segment
- Nested routes use `$projectId` param name (differs from existing `projects/$id.tsx` which uses `$id`)
- This creates separate route branches, not parent-child relationship - correct for standalone detail pages

### Breadcrumb Implementation

- PageHeader breadcrumbs array receives 3 items: `[Dashboard, Project, Entity]`
- Project breadcrumb uses template literal for `href` instead of Link params: `` `/projects/${projectId}` ``
- Final entity breadcrumb has no href (current page)

### Route Parameter Propagation

- All navigation links receive `projectId` from component props or entity data:
  - Articles table: receives `projectId` as prop
  - Pins list: receives `projectId` as prop
  - Pin card: uses `pin.blog_project_id` from Pin type
  - Calendar sidebar: uses `pin.blog_project_id` from fetched pin data

## Self-Check: PASSED

**Created files verified:**
```bash
✓ src/routes/_authed/projects/$projectId/articles/$articleId.tsx exists
✓ src/routes/_authed/projects/$projectId/pins/$pinId.tsx exists
```

**Deleted files verified:**
```bash
✓ src/routes/_authed/articles/$articleId.tsx deleted
✓ src/routes/_authed/pins/$pinId.tsx deleted
✓ src/routes/_authed/articles/ directory removed
✓ src/routes/_authed/pins/ directory removed
```

**Commits verified:**
```bash
✓ 45e9659 exists: feat(09-07): move routes to nested paths under projects
✓ 764c1dc exists: feat(09-07): update all navigation links to nested routes
```

**Route tree verification:**
```bash
✓ routeTree.gen.ts includes: /_authed/projects/$projectId/articles/$articleId
✓ routeTree.gen.ts includes: /_authed/projects/$projectId/pins/$pinId
✓ No flat /articles/$articleId route in routeTree.gen.ts
✓ No flat /pins/$pinId route in routeTree.gen.ts
```

**Navigation links verification:**
```bash
✓ grep 'to="/articles/$articleId"' returns 0 results (excluding routeTree.gen.ts)
✓ grep 'to="/pins/$pinId"' returns 0 results (excluding routeTree.gen.ts)
✓ npm run build passed with no TypeScript errors
```

## Summary

Successfully migrated article and pin detail routes from flat paths to nested paths under projects. All navigation links updated to use the new nested structure. Breadcrumbs now reflect the full project hierarchy. UAT gaps 7 and 8 are fully resolved. No deviations required.
