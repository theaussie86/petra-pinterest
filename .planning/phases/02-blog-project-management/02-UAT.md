---
status: diagnosed
phase: 02-blog-project-management
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md]
started: 2026-01-27T17:00:00Z
updated: 2026-01-27T17:12:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Create a Blog Project
expected: Clicking "Create Project" opens a dialog with Name and Blog URL fields. Filling in both and submitting creates the project. A success toast appears and the project card shows on the dashboard.
result: pass

### 2. Dashboard Project Grid
expected: After creating a project, the dashboard shows a project card with the project name, blog URL, and stats (0 articles, 0 scheduled, 0 published). The stats bar at the top shows three cards: Scheduled, Published, Pending.
result: pass

### 3. Navigate to Project Detail
expected: Clicking a project card navigates to /projects/:id. The detail page shows project name, blog URL (clickable external link), RSS URL status, scraping frequency badge, creation date, and placeholder sections for Articles and Pins.
result: pass

### 4. Edit a Blog Project
expected: Clicking the Edit button (pencil icon) opens a dialog pre-filled with the project's data showing all 4 fields: name, blog URL, RSS URL, and scraping frequency. Changing a field and saving updates the project. A success toast appears.
result: pass

### 5. Delete a Blog Project
expected: Clicking the Delete button (trash icon) opens a confirmation dialog showing the project name. Confirming deletes the project, shows a success toast, and navigates back to the dashboard. The project card is gone.
result: issue
reported: "confirmation dialog pops up and confirming deletes the projct, but i am not being redirected to dashboard after that."
severity: major

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "After confirming delete, user is navigated back to the dashboard automatically"
  status: failed
  reason: "User reported: confirmation dialog pops up and confirming deletes the projct, but i am not being redirected to dashboard after that."
  severity: major
  test: 5
  root_cause: "DeleteDialog has no onDeleted/onSuccess callback prop. Project detail page passes no navigation callback and doesn't use useNavigate(). The mutation hook only toasts + invalidates cache — navigation was never implemented."
  artifacts:
    - path: "src/components/projects/delete-dialog.tsx"
      issue: "No onDeleted/onSuccess callback prop to signal parent of successful deletion"
    - path: "src/routes/_authed/projects/$id.tsx"
      issue: "No useNavigate() hook, no navigation callback passed to DeleteDialog"
    - path: "src/lib/hooks/use-blog-projects.ts"
      issue: "useDeleteBlogProject onSuccess only toasts and invalidates, no navigation"
  missing:
    - "Add onDeleted callback prop to DeleteDialog, call after successful mutateAsync"
    - "In project detail page, pass callback that navigates to /dashboard via useNavigate()"
  debug_session: ".planning/debug/delete-no-redirect.md"
