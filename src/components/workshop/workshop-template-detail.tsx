import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Copy, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import i18n from '@/lib/i18n'
import { workspaceForStatus } from '@/lib/pin-template-workspace'
import { TemplateStatusBadge } from './template-status-badge'
import type {
  PinTemplate,
  PinTemplateRevision,
  PinTemplateStatus,
} from '@/types/pin-templates'

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
  /**
   * Change the template's review status (Freigeben / Archivieren / Zurück zu
   * Offen). When omitted, no status actions render (e.g. read-only contexts).
   */
  onChangeStatus?: (status: PinTemplateStatus) => void
  /** Disables the status actions while a change is in flight. */
  isUpdating?: boolean
  /**
   * Revision history (last 3, newest first). When provided (even empty), the
   * change-history section renders. When omitted, no history is shown.
   */
  revisions?: PinTemplateRevision[]
  /**
   * Submit a revision request (feedback text). When omitted, the "Änderung
   * wünschen" action does not render.
   */
  onRequestRevision?: (feedback: string) => void
  /** Disables the revision submit while the request is in flight. */
  isRequestingRevision?: boolean
}

/**
 * The status-change buttons available from a template's current workspace:
 * - open      → Freigeben (approved), Archivieren (archived)
 * - approved  → Zurück zu Offen (draft), Archivieren (archived)
 * - archived  → Zurück zu Offen (draft)
 */
function StatusActions({
  status,
  onChangeStatus,
  isUpdating,
}: {
  status: PinTemplateStatus
  onChangeStatus: (status: PinTemplateStatus) => void
  isUpdating?: boolean
}) {
  const { t } = useTranslation()
  const workspace = workspaceForStatus(status)

  return (
    <div className="flex flex-wrap gap-2">
      {workspace !== 'open' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUpdating}
          onClick={() => onChangeStatus('draft')}
        >
          {t('workshop.actions.reopen')}
        </Button>
      )}
      {workspace === 'open' && (
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isUpdating}
          onClick={() => onChangeStatus('approved')}
        >
          {t('workshop.actions.approve')}
        </Button>
      )}
      {workspace !== 'archived' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUpdating}
          onClick={() => onChangeStatus('archived')}
        >
          {t('workshop.actions.archive')}
        </Button>
      )}
    </div>
  )
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

/**
 * The "Änderung wünschen" control: a button that opens a dialog with a feedback
 * textarea. Submitting hands the trimmed feedback to `onRequestRevision` and
 * closes the dialog; empty feedback is ignored.
 */
function RevisionRequest({
  onRequestRevision,
  isRequestingRevision,
}: {
  onRequestRevision: (feedback: string) => void
  isRequestingRevision?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState('')

  const handleSubmit = () => {
    const trimmed = feedback.trim()
    if (!trimmed) return
    onRequestRevision(trimmed)
    setFeedback('')
    setOpen(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) setFeedback('')
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquarePlus />
        {t('workshop.actions.requestRevision')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('workshop.detail.revisionTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="revision-feedback">{t('workshop.detail.revisionFeedbackLabel')}</Label>
          <Textarea
            id="revision-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={t('workshop.detail.revisionFeedbackPlaceholder')}
            rows={4}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isRequestingRevision}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!feedback.trim() || isRequestingRevision}
          >
            {isRequestingRevision
              ? t('workshop.detail.revisionSubmitting')
              : t('workshop.detail.revisionSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The template's change history, newest first, with an empty-state hint. */
function RevisionHistory({ revisions }: { revisions: PinTemplateRevision[] }) {
  const { t } = useTranslation()

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (revisions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('workshop.detail.revisionHistoryEmpty')}</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {revisions.map((rev) => (
        <li key={rev.id} className="rounded-md border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">{formatDateTime(rev.created_at)}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{rev.feedback}</p>
        </li>
      ))}
    </ul>
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

export function WorkshopTemplateDetail({
  template,
  blogUrl,
  onChangeStatus,
  isUpdating,
  revisions,
  onRequestRevision,
  isRequestingRevision,
}: WorkshopTemplateDetailProps) {
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
        <div className="flex flex-wrap items-center gap-2">
          {onChangeStatus && (
            <StatusActions
              status={template.status}
              onChangeStatus={onChangeStatus}
              isUpdating={isUpdating}
            />
          )}
          {onRequestRevision && (
            <RevisionRequest
              onRequestRevision={onRequestRevision}
              isRequestingRevision={isRequestingRevision}
            />
          )}
          <CopyButton
            text={template.image_prompt}
            label={t('workshop.detail.copyImagePrompt')}
            variant="default"
          />
        </div>
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

      {/* Change history — only rendered when the caller passes revisions. */}
      {revisions !== undefined && (
        <>
          <Separator />
          <Section title={t('workshop.detail.revisionHistory')}>
            <RevisionHistory revisions={revisions} />
          </Section>
        </>
      )}
    </div>
  )
}
