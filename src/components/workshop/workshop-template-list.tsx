import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { TemplateStatusBadge } from './template-status-badge'
import type { PinTemplate } from '@/types/pin-templates'

interface WorkshopTemplateListProps {
  templates: PinTemplate[]
  selectedTemplateId: string | null
  onSelect: (templateId: string) => void
}

/**
 * The overlay lines of a template joined into one line, used as a compact
 * preview of what the pin will say.
 */
function overlayPreview(overlay: string | null): string {
  if (!overlay) return ''
  return overlay
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' · ')
}

export function WorkshopTemplateList({
  templates,
  selectedTemplateId,
  onSelect,
}: WorkshopTemplateListProps) {
  const { t } = useTranslation()
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  // Keyboard navigation (issue #80) can move the selection off-screen; keep the
  // selected row in view.
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedTemplateId])

  if (templates.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{t('workshop.noTemplates')}</p>
  }

  return (
    <ul className="flex flex-col gap-0.5" aria-label={t('workshop.templatesHeading')}>
      {templates.map((template) => {
        const isSelected = template.id === selectedTemplateId
        const overlay = overlayPreview(template.overlay)
        return (
          <li key={template.id}>
            <button
              type="button"
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onSelect(template.id)}
              aria-current={isSelected ? 'true' : undefined}
              className={cn(
                'grid w-full grid-cols-[2rem_minmax(0,1fr)] gap-x-2 rounded-lg px-2 py-2.5 text-left transition-colors',
                'hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
              )}
            >
              <span
                className={cn(
                  'pt-px text-right text-sm tabular-nums text-muted-foreground',
                  isSelected && 'font-semibold text-primary',
                )}
              >
                {template.position}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className={cn('truncate text-sm', isSelected && 'font-medium')}>
                    {template.title ?? '—'}
                  </span>
                  {template.status === 'needs_revision' && (
                    <span className="shrink-0">
                      <TemplateStatusBadge status={template.status} />
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {template.pin_type && (
                    <span className="shrink-0 font-medium text-foreground/70">
                      {template.pin_type}
                    </span>
                  )}
                  {template.pin_type && overlay && <span aria-hidden>·</span>}
                  {overlay && <span className="truncate">{overlay}</span>}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
