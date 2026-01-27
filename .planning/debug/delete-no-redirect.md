---
status: diagnosed
trigger: "After confirming project deletion on /projects/:id, user is NOT redirected back to /dashboard despite success toast appearing"
created: 2026-01-27T00:00:00Z
updated: 2026-01-27T00:00:00Z
---

## Current Focus

hypothesis: No component in the chain wires navigation after delete -- the DeleteDialog has no onDeleted/onSuccess callback prop, and the project detail page passes no navigation callback to DeleteDialog
test: Trace the full delete flow across all three files
expecting: Confirm that navigation logic is completely absent from the delete flow
next_action: Document evidence from all three files

## Symptoms

expected: After delete confirmation, navigate to /dashboard automatically
actual: Project is deleted successfully (success toast appears) but user stays on /projects/:id page
errors: None -- the delete itself succeeds
reproduction: Go to /projects/:id, click Delete, confirm in dialog
started: Likely always broken (navigation was never wired)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-01-27T00:01:00Z
  checked: src/routes/_authed/projects/$id.tsx (lines 184-194)
  found: DeleteDialog is rendered with only three props -- open, onOpenChange, project. No onSuccess/onDeleted callback is passed. No useNavigate() or router.navigate() call exists anywhere in the component.
  implication: The project detail page does NOT wire any navigation logic to the delete flow.

- timestamp: 2026-01-27T00:01:00Z
  checked: src/components/projects/delete-dialog.tsx (interface + handleDelete)
  found: DeleteDialogProps only accepts { open, onOpenChange, project }. There is NO onSuccess/onDeleted callback prop. handleDelete() calls mutateAsync, then onOpenChange(false) to close the dialog. That is all.
  implication: The DeleteDialog component has no mechanism to notify its parent that deletion succeeded. It only closes itself.

- timestamp: 2026-01-27T00:01:00Z
  checked: src/lib/hooks/use-blog-projects.ts (useDeleteBlogProject hook, lines 92-105)
  found: The hook's onSuccess only does toast.success('Project deleted') and invalidates the blog-projects query. It does NOT accept or call any navigation callback.
  implication: Navigation is not handled at the hook level either.

## Resolution

root_cause: Navigation after project deletion is completely missing from the codebase. The delete flow has three layers -- (1) the project detail page, (2) the DeleteDialog component, and (3) the useDeleteBlogProject hook -- and NONE of them contain any navigation logic. Specifically: (a) DeleteDialog has no onSuccess/onDeleted callback prop, so the parent page cannot react to a successful deletion; (b) the project detail page does not pass any navigation callback and does not use useNavigate(); (c) the mutation hook only shows a toast and invalidates the cache. The user report mentions "a custom delete handler with onSuccess callback that should navigate to dashboard" but this does not exist in the code.
fix:
verification:
files_changed: []
