import type { PinSortField } from '@/types/pins'

export type PinColumnId =
  | 'select'
  | 'image'
  | 'title'
  | 'article'
  | 'project'
  | 'board'
  | 'status'
  | 'scheduled_at'
  | 'published_at'
  | 'created_at'
  | 'updated_at'
  | 'actions'

export interface PinColumnDef {
  id: PinColumnId
  labelKey: string
  toggleable: boolean
  sortField?: PinSortField
  width?: string
  defaultVisible: boolean
}

export const ALL_PIN_COLUMNS: PinColumnDef[] = [
  { id: 'select', labelKey: '', toggleable: false, width: 'w-[40px]', defaultVisible: true },
  { id: 'image', labelKey: 'pinTable.columnImage', toggleable: false, width: 'w-[60px]', defaultVisible: true },
  { id: 'title', labelKey: 'pinTable.columnTitle', toggleable: false, sortField: 'title', defaultVisible: true },
  { id: 'article', labelKey: 'pinTable.columnArticle', toggleable: false, width: 'w-[200px]', defaultVisible: true },
  { id: 'project', labelKey: 'pinTable.columnProject', toggleable: false, width: 'w-[200px]', defaultVisible: true },
  { id: 'board', labelKey: 'pinTable.columnBoard', toggleable: true, width: 'w-[180px]', defaultVisible: false },
  { id: 'status', labelKey: 'pinTable.columnStatus', toggleable: false, sortField: 'status', width: 'w-[180px]', defaultVisible: true },
  { id: 'scheduled_at', labelKey: 'pinTable.columnScheduled', toggleable: true, sortField: 'scheduled_at', width: 'w-[120px]', defaultVisible: false },
  { id: 'published_at', labelKey: 'pinTable.columnPublished', toggleable: true, sortField: 'published_at', width: 'w-[120px]', defaultVisible: false },
  { id: 'created_at', labelKey: 'pinTable.columnCreated', toggleable: true, sortField: 'created_at', width: 'w-[120px]', defaultVisible: false },
  { id: 'updated_at', labelKey: 'pinTable.columnUpdated', toggleable: true, sortField: 'updated_at', width: 'w-[120px]', defaultVisible: false },
  { id: 'actions', labelKey: '', toggleable: false, width: 'w-[100px]', defaultVisible: true },
]

const COLUMN_MAP = new Map(ALL_PIN_COLUMNS.map((col) => [col.id, col]))

export function getColumnsForIds(ids: PinColumnId[]): PinColumnDef[] {
  return ids.map((id) => COLUMN_MAP.get(id)!).filter(Boolean)
}

export function getDefaultVisibility(ids: PinColumnId[]): Record<PinColumnId, boolean> {
  const visibility = {} as Record<PinColumnId, boolean>
  for (const id of ids) {
    const col = COLUMN_MAP.get(id)
    if (col) {
      visibility[id] = col.defaultVisible
    }
  }
  return visibility
}

export function getStoredVisibility(storageKey: string, ids: PinColumnId[]): Record<PinColumnId, boolean> {
  const defaults = getDefaultVisibility(ids)
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaults
    const stored = JSON.parse(raw) as Record<string, boolean>
    // Merge stored values into defaults — only for known toggleable columns
    for (const id of ids) {
      const col = COLUMN_MAP.get(id)
      if (col?.toggleable && typeof stored[id] === 'boolean') {
        defaults[id] = stored[id]
      }
    }
  } catch {
    // Corrupted data — fall back to defaults
  }
  return defaults
}

export function saveVisibility(storageKey: string, visibility: Record<PinColumnId, boolean>): void {
  try {
    // Only persist toggleable columns to keep the stored data minimal
    const toStore: Record<string, boolean> = {}
    for (const [id, visible] of Object.entries(visibility)) {
      const col = COLUMN_MAP.get(id as PinColumnId)
      if (col?.toggleable) {
        toStore[id] = visible
      }
    }
    localStorage.setItem(storageKey, JSON.stringify(toStore))
  } catch {
    // localStorage unavailable (SSR, quota exceeded)
  }
}
