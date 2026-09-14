import type { PinTemplate, PinTemplateStatus } from '@/types/pin-templates'

/**
 * The three review workspaces (middle-column tabs), in review order:
 * - `open`      — templates still to review (`draft`, `needs_revision`)
 * - `approved`  — signed-off templates (`approved`)
 * - `archived`  — retired templates (`archived`)
 */
export const WORKSPACE_TABS = ['open', 'approved', 'archived'] as const

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]

/** The workspace a template belongs to, derived from its status. */
export function workspaceForStatus(status: PinTemplateStatus): WorkspaceTab {
  switch (status) {
    case 'approved':
      return 'approved'
    case 'archived':
      return 'archived'
    default:
      return 'open'
  }
}

/** Per-workspace template counts for the tab badges. */
export function countByWorkspace(templates: PinTemplate[]): Record<WorkspaceTab, number> {
  const counts: Record<WorkspaceTab, number> = { open: 0, approved: 0, archived: 0 }
  for (const template of templates) {
    counts[workspaceForStatus(template.status)] += 1
  }
  return counts
}

/**
 * The template to select once `removedId` leaves the current list (e.g. after a
 * status change moves it to another tab): the next item after it, else the
 * previous item, else `null` (empty state). Returns `null` when `removedId` is
 * not in the list.
 */
export function nextSelectionAfterRemoval(
  list: PinTemplate[],
  removedId: string,
): string | null {
  const index = list.findIndex((t) => t.id === removedId)
  if (index === -1) return null
  const next = list[index + 1]
  if (next) return next.id
  const prev = list[index - 1]
  if (prev) return prev.id
  return null
}
