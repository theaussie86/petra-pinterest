---
phase: 02-blog-project-management
plan: 03
subsystem: ui
tags: [react, tanstack-router, tanstack-query, react-hook-form, zod, shadcn-ui, radix-ui]
requires: [02-02]
provides: [dashboard-ui, project-crud-interface, stats-bar, project-cards, dialogs]
affects: [02-04]
tech-stack:
  added:
    - "@radix-ui/react-select"
  patterns:
    - "React Hook Form with Zod validation for forms"
    - "TanStack Router Link for card navigation"
    - "Dialog-based CRUD with optimistic updates"
    - "Responsive CSS Grid for card layout"
key-files:
  created:
    - src/components/projects/project-dialog.tsx
    - src/components/projects/delete-dialog.tsx
    - src/components/dashboard/stats-bar.tsx
    - src/components/dashboard/project-card.tsx
    - src/components/ui/select.tsx
  modified:
    - src/routes/_authed/dashboard.tsx
    - src/components/dashboard/empty-state.tsx
    - src/components/ui/button.tsx
    - src/routes/_authed/projects/$id.tsx
key-decisions:
  - decision: "Create and edit share same ProjectDialog component with mode detection via project prop"
    rationale: "Reduces duplication, single validation schema, consistent UX"
    impact: "Simpler maintenance, less code"
  - decision: "Create mode shows only name + blog_url; edit mode shows all 4 fields"
    rationale: "Minimal creation per CONTEXT.md — users can add RSS/frequency later via edit"
    impact: "Faster initial project creation, progressive disclosure"
  - decision: "Manual RSS URL validation in onSubmit instead of Zod schema complexity"
    rationale: "Zod's .optional().or(z.literal('')) creates TypeScript inference issues with react-hook-form"
    impact: "Simpler types, validation still enforced"
  - decision: "Phase 2 stats are hard-coded to 0 with structure ready for future data"
    rationale: "Articles and pins don't exist yet, but UI demonstrates final design"
    impact: "Visual completeness now, easy data integration in Phase 3+"
duration: 5min
completed: 2026-01-27
---

# Phase 2 Plan 3: Blog Projects UI Summary

**One-liner:** Complete dashboard UI with responsive project card grid, global stats bar, React Hook Form + Zod dialogs for CRUD operations, and toast notifications

## Performance

**Execution time:** 5 minutes
**Tasks completed:** 2/2
**Commits:** 2 atomic commits

**Build status:** ✅ Passing

## Accomplishments

### Task 1: Create project dialog (create/edit) and delete dialog components

Built shared `ProjectDialog` component that handles both create and edit modes:
- **Create mode:** Shows only name + blog_url (minimal creation per CONTEXT.md)
- **Edit mode:** Shows all 4 fields (name, blog_url, rss_url, scraping_frequency)
- **Validation:** React Hook Form with Zod schema, inline error messages below fields
- **Submit behavior:** "Saving..." loading state, uses `useCreateBlogProject` or `useUpdateBlogProject` mutations
- **Form reset:** Clears on close and successful submit

Built `DeleteDialog` component with confirmation flow:
- Shows project name being deleted
- "Are you sure?" confirmation message
- Destructive-styled Delete button with "Deleting..." loading state
- Uses `useDeleteBlogProject` mutation

**Supporting components:**
- Added destructive variant to Button component (red background, hover states)
- Created Select component using `@radix-ui/react-select` for scraping_frequency dropdown
- Installed `@radix-ui/react-select` dependency (blocking issue — Rule 3)
- Fixed duplicate import in `src/routes/_authed/projects/$id.tsx` (existing file had two `createFileRoute` imports)

### Task 2: Build dashboard with project grid, stats bar, and updated empty state

**StatsBar component:**
- 3 stat cards in responsive grid: Scheduled, Published, Pending
- Hard-coded zeros for Phase 2 (articles/pins don't exist yet)
- Icons from lucide-react (Clock, CheckCircle, AlertCircle)
- Cards are clickable with hover states (navigation wired in future phases)

**ProjectCard component:**
- Displays project name (bold), blog URL (truncated with external link icon), per-project stats (0 articles, 0 scheduled, 0 published)
- Entire card navigates to `/projects/:id` via TanStack Router `<Link>` component
- Edit (Pencil) and Delete (Trash) buttons with `e.stopPropagation()` to prevent card navigation
- Uses Card, CardHeader, CardContent, CardFooter from shadcn/ui

**EmptyDashboardState update:**
- Accepts `onCreateProject` callback prop
- Removed `disabled` state and "(Blog creation coming in next phase)" text
- CTA button now opens create dialog

**Dashboard route:**
- Uses `useBlogProjects()` hook for data fetching
- State management: `createDialogOpen`, `editProject`, `deleteProject`
- Layout: StatsBar → "Create Project" button (when projects exist) → Empty state OR project grid
- Responsive CSS Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Loading state: spinner
- Error state: error message with retry button
- Renders ProjectDialog (create or edit) and DeleteDialog

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | e9f4b96 | feat(02-03): create project and delete dialog components |
| 2 | 809a42a | feat(02-03): build dashboard with project grid, stats bar, and dialogs |

## Files Created

- `src/components/projects/project-dialog.tsx` — Shared create/edit dialog with React Hook Form + Zod
- `src/components/projects/delete-dialog.tsx` — Delete confirmation dialog
- `src/components/dashboard/stats-bar.tsx` — Global statistics summary (3 stat cards)
- `src/components/dashboard/project-card.tsx` — Individual project card with edit/delete actions
- `src/components/ui/select.tsx` — Select dropdown component using Radix UI primitives

## Files Modified

- `src/routes/_authed/dashboard.tsx` — Main dashboard with project grid, stats bar, dialogs, loading/error states
- `src/components/dashboard/empty-state.tsx` — Updated to accept onCreateProject callback, removed disabled state
- `src/components/ui/button.tsx` — Added destructive variant for delete actions
- `src/routes/_authed/projects/$id.tsx` — Fixed duplicate imports, updated dialog props
- `package.json` + `package-lock.json` — Added `@radix-ui/react-select` dependency

## Decisions Made

1. **Shared ProjectDialog for create and edit** — Mode detection via `project` prop. Create mode shows only name + blog_url (minimal creation), edit mode shows all fields. Reduces code duplication, single validation schema.

2. **Manual RSS URL validation instead of complex Zod schema** — Zod's `.optional().or(z.literal(''))` creates TypeScript inference issues with react-hook-form. Manual validation in `onSubmit` provides same correctness with simpler types.

3. **Phase 2 stats hard-coded to 0** — Articles and pins don't exist yet. UI shows final structure ready for real data in Phase 3+. Demonstrates complete design now.

4. **Project cards navigate via TanStack Router Link** — Entire card is clickable for navigation to `/projects/:id`. Edit/Delete buttons use `stopPropagation` to prevent navigation when clicked.

5. **Responsive grid with Tailwind breakpoints** — `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` provides mobile-first layout that adapts to tablet and desktop.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing @radix-ui/react-select dependency**
- **Found during:** Task 1, build step
- **Issue:** Created Select component but Radix UI Select primitives not installed
- **Fix:** Ran `npm install @radix-ui/react-select`
- **Files modified:** package.json, package-lock.json
- **Commit:** e9f4b96 (included in Task 1 commit)

**2. [Rule 1 - Bug] Duplicate createFileRoute import in project detail page**
- **Found during:** Task 1, build step
- **Issue:** `src/routes/_authed/projects/$id.tsx` had duplicate imports on line 1 and 3: `import { createFileRoute } from '@tanstack/react-router'` and `import { createFileRoute, Link, useNavigate } from '@tanstack/router'`
- **Fix:** Removed duplicate line, consolidated imports
- **Files modified:** src/routes/_authed/projects/$id.tsx
- **Commit:** e9f4b96 (included in Task 1 commit)

**3. [Rule 1 - Bug] Unused imports in project detail page**
- **Found during:** Task 1, TypeScript build step
- **Issue:** `navigate` and `deleteMutation` declared but never used after updating dialog interfaces
- **Fix:** Removed unused imports and variable declarations
- **Files modified:** src/routes/_authed/projects/$id.tsx
- **Commit:** e9f4b96 (included in Task 1 commit)

## Issues Encountered

None. All builds passed, all verifications successful.

## Next Phase Readiness

**Ready for Phase 2 Plan 4 (Project Detail Page):**
- ✅ Dashboard UI complete with project grid
- ✅ CRUD operations functional via dialogs
- ✅ Toast notifications working for all operations
- ✅ Project cards navigate to `/projects/:id`
- ✅ Loading and error states handled
- ✅ Responsive layout verified

**Blockers for future phases:**
- None identified

**Recommendations:**
1. In Phase 3+, replace hard-coded zeros in StatsBar and ProjectCard with real query data
2. Wire stat card onClick handlers to filtered views once articles/pins exist
3. Consider optimistic update for edit mutation (currently only create has it)
4. Test keyboard navigation and accessibility in dialogs before production launch
