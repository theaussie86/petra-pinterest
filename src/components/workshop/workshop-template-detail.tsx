import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TemplateStatusBadge } from './template-status-badge'
import type { PinTemplate } from '@/types/pin-templates'

/**
 * Bare domain (without a `www.` prefix) of the blog project, used as the fixed
 * footer line in the overlay preview. Falls back to the trimmed input when the
 * value is not a parseable absolute URL.
 */
export function overlayFooterDomain(blogUrl: string): string {
  const trimmed = blogUrl.trim()
  try {
    const host = new URL(trimmed).hostname.toLowerCase()
    return host.replace(/^www\./, '')
  } catch {
    return trimmed
  }
}

interface WorkshopTemplateDetailProps {
  template: PinTemplate
  /** The owning blog project's URL — its domain is the overlay footer. */
  blogUrl: string
}

/**
 * A copy-to-clipboard button that writes `text` and shows a success toast.
 * Briefly swaps its icon to a checkmark for feedback.
 */
function CopyButton({
  text,
  label,
  variant = 'outline',
}: {
  text: string
  label: string
  variant?: 'default' | 'outline'
}) {
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success(t('workshop.detail.copied'))
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Button type="button" variant={variant} size="sm" onClick={handleCopy}>
      {copied ? <Check /> : <Copy />}
      {label}
    </Button>
  )
}

/** A titled block with a small uppercase heading. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** One inline label/value row in the design brief; renders nothing when empty. */
function DesignRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** A bulleted keyword list under a small heading; renders nothing when empty. */
function KeywordList({ label, items }: { label: string; items: string[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        <ul className="list-disc pl-5">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </dd>
    </div>
  )
}

export function WorkshopTemplateDetail({ template, blogUrl }: WorkshopTemplateDetailProps) {
  const { t } = useTranslation()

  const overlayLines = template.overlay ? template.overlay.split('\n').filter(Boolean) : []
  const design = template.design ?? {}
  const colors = design.colors ?? []

  return (
    <div className="flex flex-col gap-6">
      {/* Sticky action bar — the copy-prompt button is the most-used control. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-b border-purple-100/50 bg-background/95 px-1 py-3 backdrop-blur dark:border-white/5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">#{template.position}</span>
          <TemplateStatusBadge status={template.status} />
        </div>
        <CopyButton
          text={template.image_prompt}
          label={t('workshop.detail.copyImagePrompt')}
          variant="default"
        />
      </div>

      {/* Title + description (missing description is flagged, never blank) */}
      <Section title={t('workshop.detail.titleAndDescription')}>
        <p className="text-base font-semibold">{template.title ?? '—'}</p>
        {template.description ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {template.description}
          </p>
        ) : (
          <p className="text-sm italic text-amber-600 dark:text-amber-400">
            {t('workshop.detail.descriptionMissing')}
          </p>
        )}
      </Section>

      <Separator />

      {/* Board */}
      <Section title={t('workshop.detail.board')}>
        <p className="text-sm">{template.board_name_raw ?? '—'}</p>
      </Section>

      <Separator />

      {/* Overlay preview with a fixed footer (the blog domain) */}
      <Section title={t('workshop.detail.overlay')}>
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="flex flex-col gap-1">
            {overlayLines.length > 0 ? (
              overlayLines.map((line, i) => (
                <p key={i} className="text-lg font-bold leading-tight">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <div className="mt-4 border-t pt-2 text-center text-xs font-medium text-muted-foreground">
            {overlayFooterDomain(blogUrl)}
          </div>
        </div>
      </Section>

      <Separator />

      {/* Keyword block */}
      <Section title={t('workshop.detail.keywords')}>
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t('workshop.detail.mainKeyword')}</dt>
            <dd className="font-medium">{template.main_keyword}</dd>
          </div>
          <KeywordList label={t('workshop.detail.longtails')} items={template.longtails} />
          {template.search_intent && (
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('workshop.detail.searchIntent')}
              </dt>
              <dd>{template.search_intent}</dd>
            </div>
          )}
          <KeywordList label={t('workshop.detail.searchPhrases')} items={template.search_phrases} />
        </dl>
      </Section>

      <Separator />

      {/* Full image prompt text */}
      <Section title={t('workshop.detail.imagePrompt')}>
        <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {template.image_prompt}
        </p>
      </Section>

      <Separator />

      {/* Design brief with color swatches */}
      <Section title={t('workshop.detail.designBrief')}>
        <dl className="flex flex-col gap-2 text-sm">
          <DesignRow label={t('workshop.detail.designName')} value={design.name} />
          <DesignRow label={t('workshop.detail.designLayout')} value={design.layout} />
          <DesignRow
            label={t('workshop.detail.designImagePosition')}
            value={design.image_position}
          />
          <DesignRow label={t('workshop.detail.designFonts')} value={design.fonts?.join(', ')} />
          <DesignRow
            label={t('workshop.detail.designScrollStopper')}
            value={design.scroll_stopper}
          />
        </dl>
        {colors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {colors.map((color, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span
                  data-testid="design-color"
                  className="h-6 w-6 rounded-full border shadow-sm"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="font-mono text-xs text-muted-foreground">{color}</span>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Separator />

      {/* Quality check */}
      {template.quality_check && template.quality_check.length > 0 && (
        <>
          <Section title={t('workshop.detail.qualityCheck')}>
            <ul className="flex flex-col gap-1 text-sm">
              {template.quality_check.map((qc, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{qc}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Separator />
        </>
      )}

      {/* Image idea with its own copy button */}
      <Section title={t('workshop.detail.imageIdea')}>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {template.image_idea ?? '—'}
        </p>
        {template.image_idea && (
          <div>
            <CopyButton
              text={template.image_idea}
              label={t('workshop.detail.copyImageIdea')}
            />
          </div>
        )}
      </Section>
    </div>
  )
}
