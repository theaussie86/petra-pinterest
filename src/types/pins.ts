// Pin status constants with display labels and badge colors
export const PIN_STATUS = {
  draft: { label: 'Entwurf', color: 'slate' },
  ready_for_generation: { label: 'Bereit fur Generierung', color: 'blue' },
  generate_metadata: { label: 'Metadaten generieren', color: 'violet' },
  generating_metadata: { label: 'Metadaten werden generiert', color: 'violet' },
  metadata_created: { label: 'Metadaten erstellt', color: 'teal' },
  ready_to_schedule: { label: 'Bereit zum Planen', color: 'green' },
  publishing: { label: 'Wird veroffentlicht', color: 'amber' },
  published: { label: 'Veroffentlicht', color: 'emerald' },
  error: { label: 'Fehler', color: 'red' },
  deleted: { label: 'Loschen', color: 'gray' },
} as const

export type PinStatus = keyof typeof PIN_STATUS

// Active statuses (editable in UI for Phase 5)
export const ACTIVE_STATUSES: PinStatus[] = [
  'draft',
  'ready_for_generation',
  'generate_metadata',
  'metadata_created',
  'ready_to_schedule',
]

// System-managed statuses (visible but not user-selectable)
export const SYSTEM_MANAGED_STATUSES: PinStatus[] = [
  'generating_metadata',
  'publishing',
  'published',
]

export interface Pin {
  id: string
  tenant_id: string
  blog_project_id: string
  blog_article_id: string
  board_id: string | null
  image_path: string
  title: string | null
  description: string | null
  alt_text: string | null
  status: PinStatus
  error_message: string | null
  previous_status: PinStatus | null
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
  board_id?: string | null
  title?: string | null
  description?: string | null
}

export interface PinUpdate {
  id: string
  title?: string | null
  description?: string | null
  alt_text?: string | null
  board_id?: string | null
  status?: PinStatus
  error_message?: string | null
  scheduled_at?: string | null
}

export interface Board {
  id: string
  tenant_id: string
  blog_project_id: string
  name: string
  pinterest_board_id: string | null
  cover_image_url: string | null
  created_at: string
  updated_at: string
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
export type PinSortField = 'title' | 'status' | 'created_at' | 'updated_at'
export type PinViewMode = 'table' | 'grid'

// Helper to get Tailwind badge classes for a pin status
export function getStatusBadgeClasses(status: PinStatus): string {
  const colorMap: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-700',
    violet: 'bg-violet-100 text-violet-700',
    teal: 'bg-teal-100 text-teal-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-500',
  }
  return colorMap[PIN_STATUS[status].color] || 'bg-slate-100 text-slate-700'
}
