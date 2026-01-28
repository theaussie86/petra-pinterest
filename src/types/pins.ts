// Pin status constants with display labels and badge colors
export const PIN_STATUS = {
  entwurf: { label: 'Entwurf', color: 'slate' },
  bereit_fuer_generierung: { label: 'Bereit fur Generierung', color: 'blue' },
  pin_generieren: { label: 'Pin generieren', color: 'indigo' },
  pin_wird_generiert: { label: 'Pin wird generiert', color: 'indigo' },
  pin_generiert: { label: 'Pin generiert', color: 'purple' },
  metadaten_generieren: { label: 'Metadaten generieren', color: 'violet' },
  metadaten_werden_generiert: { label: 'Metadaten werden generiert', color: 'violet' },
  metadaten_erstellt: { label: 'Metadaten erstellt', color: 'teal' },
  bereit_zum_planen: { label: 'Bereit zum Planen', color: 'green' },
  veroeffentlicht: { label: 'Veroffentlicht', color: 'emerald' },
  fehler: { label: 'Fehler', color: 'red' },
  loeschen: { label: 'Loschen', color: 'gray' },
} as const

export type PinStatus = keyof typeof PIN_STATUS

// Phase 4 active statuses (editable in UI)
export const PHASE4_ACTIVE_STATUSES: PinStatus[] = ['entwurf', 'bereit_fuer_generierung']

// Phase 4 disabled statuses (visible but not editable until later phases)
export const PHASE4_DISABLED_STATUSES: PinStatus[] = [
  'pin_generieren',
  'pin_wird_generiert',
  'pin_generiert',
  'metadaten_generieren',
  'metadaten_werden_generiert',
  'metadaten_erstellt',
  'bereit_zum_planen',
  'veroeffentlicht',
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
  status: PinStatus
  error_message: string | null
  scheduled_at: string | null
  published_at: string | null
  pinterest_pin_id: string | null
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
  board_id?: string | null
  status?: PinStatus
  error_message?: string | null
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

// Sort and view mode types for pin list UI
export type PinSortField = 'title' | 'status' | 'created_at' | 'updated_at'
export type PinViewMode = 'table' | 'grid'

// Helper to get Tailwind badge classes for a pin status
export function getStatusBadgeClasses(status: PinStatus): string {
  const colorMap: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    purple: 'bg-purple-100 text-purple-700',
    violet: 'bg-violet-100 text-violet-700',
    teal: 'bg-teal-100 text-teal-700',
    green: 'bg-green-100 text-green-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-500',
  }
  return colorMap[PIN_STATUS[status].color] || 'bg-slate-100 text-slate-700'
}
