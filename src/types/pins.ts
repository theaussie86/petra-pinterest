// Pin status constants with badge colors (labels come from i18n)
export const PIN_STATUS = {
  draft: { color: 'slate' },
  generate_metadata: { color: 'violet' },
  generating_metadata: { color: 'violet' },
  metadata_created: { color: 'blue' },
  published: { color: 'emerald' },
  error: { color: 'red' },
  deleted: { color: 'gray' },
} as const

export type PinStatus = keyof typeof PIN_STATUS

// Active statuses (editable in UI)
export const ACTIVE_STATUSES: PinStatus[] = [
  'draft',
  'generate_metadata',
  'metadata_created',
]

// System-managed statuses (visible but not user-selectable)
export const SYSTEM_MANAGED_STATUSES: PinStatus[] = [
  'generating_metadata',
  'published',
]

export interface Pin {
  id: string
  tenant_id: string
  blog_project_id: string
  blog_article_id: string
  pinterest_board_id: string | null
  pinterest_board_name: string | null
  image_path: string | null
  media_type: 'image' | 'video'
  title: string | null
  description: string | null
  alt_text: string | null
  status: PinStatus
  error_message: string | null
  previous_status: PinStatus | null
  alternate_url: string | null
  scheduled_at: string | null
  published_at: string | null
  pinterest_pin_id: string | null
  pinterest_pin_url: string | null
  created_at: string
  updated_at: string
}

export interface PinInsert {
  blog_project_id: string
  blog_article_id: string
  image_path: string
  media_type?: 'image' | 'video'
  pinterest_board_id?: string | null
  pinterest_board_name?: string | null
  title?: string | null
  description?: string | null
}

export interface PinUpdate {
  id: string
  title?: string | null
  description?: string | null
  alt_text?: string | null
  alternate_url?: string | null
  pinterest_board_id?: string | null
  pinterest_board_name?: string | null
  status?: PinStatus
  error_message?: string | null
  scheduled_at?: string | null
}

export interface PinMetadataGeneration {
  id: string
  pin_id: string
  tenant_id: string
  title: string
  description: string
  alt_text: string
  feedback: string | null
  created_at: string
}

// Sort and view mode types for pin list UI
export type PinSortField = 'title' | 'status' | 'created_at' | 'updated_at' | 'scheduled_at' | 'published_at'
export type PinViewMode = 'table' | 'grid'

// Helper to get Tailwind badge classes for a pin status
export function getStatusBadgeClasses(status: PinStatus): string {
  const colorMap: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    violet: 'bg-violet-100 text-violet-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-500',
  }
  return colorMap[PIN_STATUS[status].color] || 'bg-slate-100 text-slate-700'
}
