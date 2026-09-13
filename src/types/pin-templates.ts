// Pin template status constants with badge colors (labels come from i18n).
// Templates are produced by an external agent and reviewed inside Pinfinity;
// the UI changes status but never edits template texts (issue #75, epic #74).
export const PIN_TEMPLATE_STATUS = {
  draft: { color: 'slate' },
  needs_revision: { color: 'amber' },
  approved: { color: 'emerald' },
  archived: { color: 'gray' },
} as const

export type PinTemplateStatus = keyof typeof PIN_TEMPLATE_STATUS

export function getTemplateStatusBadgeClasses(status: PinTemplateStatus): string {
  const colorMap: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    gray: 'bg-gray-100 text-gray-500',
  }
  return colorMap[PIN_TEMPLATE_STATUS[status].color] || 'bg-slate-100 text-slate-700'
}

// The `design` jsonb payload shape (all fields optional — legacy templates may
// omit any of them).
export interface PinTemplateDesign {
  name?: string
  layout?: string
  image_position?: string
  fonts?: string[]
  scroll_stopper?: string
  colors?: string[]
}

export interface PinTemplate {
  id: string
  tenant_id: string
  blog_article_id: string
  position: number
  pin_type: string | null
  status: PinTemplateStatus
  title: string | null
  description: string | null
  board_name_raw: string | null
  overlay: string | null
  main_keyword: string
  longtails: string[] | null
  search_phrases: string[] | null
  quality_check: string[] | null
  search_intent: string | null
  image_idea: string | null
  image_prompt: string
  design: PinTemplateDesign | null
  season: string | null
  created_at: string
  updated_at: string
}
