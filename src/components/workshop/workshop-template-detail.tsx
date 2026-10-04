import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  MessageSquarePlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { TemplateStatusBadge } from './template-status-badge'
import { WorkshopPinSketch } from './workshop-pin-sketch'
import type { PinTemplate, PinTemplateRevision, PinTemplateStatus } from '@/types/pin-templates'

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

/**
 * A small keyboard-shortcut hint rendered inside an action-bar button, so the
 * key that triggers it (issue #80) is discoverable at the control itself.
 */
function ShortcutKbd({ keyLabel }: { keyLabel: string }) {
  return (
    <kbd className="ml-1 rounded border border-current/30 px-1 font-mono text-[10px] leading-none opacity-70">
      {keyLabel}
    </kbd>
  )
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
  /**
   * Controlled open state of the revision dialog. When provided, the dialog is
   * driven by the caller (so a keyboard shortcut can open it); otherwise the
   * dialog manages its own open state.
   */
  revisionOpen?: boolean
  /** Called when the (controlled) revision dialog wants to open/close. */
  onRevisionOpenChange?: (open: boolean) => void
  /**
   * Position within the active workspace plus prev/next handlers (the same
   * moves as j/k). When omitted, no navigation renders.
   */
  navigation?: {
    index: number
    total: number
    onPrev: () => void
    onNext: () => void
  }
}

/**
 * The primary status action for a template's current workspace: Freigeben
 * (approved) while open, otherwise Zurück zu Offen (draft). Archivieren sits
 * apart in the head row (see ArchiveAction) so it is never hit by accident.
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
    <>
      {workspace === 'open' && (
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isUpdating}
          onClick={() => onChangeStatus('approved')}
        >
          <Check />
          {t('workshop.actions.approve')}
          <ShortcutKbd keyLabel="f" />
        </Button>
      )}
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
    </>
  )
}

/** Archivieren, offered from every workspace except the archive itself. */
function ArchiveAction({
  status,
  onChangeStatus,
  isUpdating,
}: {
  status: PinTemplateStatus
  onChangeStatus: (status: PinTemplateStatus) => void
  isUpdating?: boolean
}) {
  const { t } = useTranslation()
  if (workspaceForStatus(status) === 'archived') return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isUpdating}
      onClick={() => onChangeStatus('archived')}
      className="text-muted-foreground"
    >
      <Archive />
      {t('workshop.actions.archive')}
    </Button>
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
  shortcut,
  className,
}: {
  text: string
  label: string
  variant?: 'default' | 'outline' | 'ghost'
  shortcut?: string
  className?: string
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
    <Button type="button" variant={variant} size="sm" onClick={handleCopy} className={className}>
      {copied ? <Check /> : <Copy />}
      {label}
      {shortcut && <ShortcutKbd keyLabel={shortcut} />}
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
  open: controlledOpen,
  onOpenChange,
}: {
  onRequestRevision: (feedback: string) => void
  isRequestingRevision?: boolean
  /** When provided, the dialog open state is controlled by the caller. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [internalOpen, setInternalOpen] = useState(false)
  const [feedback, setFeedback] = useState('')

  const open = controlledOpen ?? internalOpen
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }

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
        <ShortcutKbd keyLabel="r" />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('workshop.detail.revisionTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="revision-feedback">{t('workshop.detail.revisionFeedbackLabel')}</Label>
          <Textarea
            id="revision-feedback"
            autoFocus
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
    return (
      <p className="text-sm text-muted-foreground">{t('workshop.detail.revisionHistoryEmpty')}</p>
    )
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

/** A titled block of the detail view. */
function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** One label/value row in the design brief; renders nothing when empty. */
function DesignRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

/** Keywords as compact chips under a small label; renders nothing when empty. */
function KeywordChips({ label, items }: { label: string; items: string[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs">
            {item}
          </span>
        ))}
      </dd>
    </div>
  )
}

/** The ~2,000-character image prompt, clamped until the reviewer expands it. */
function ImagePrompt({ text }: { text: string }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p
        className={cn(
          'whitespace-pre-wrap text-sm leading-relaxed text-foreground/80',
          !expanded && 'line-clamp-5',
        )}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-2 flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        {expanded ? t('workshop.detail.showLess') : t('workshop.detail.showFullPrompt')}
      </button>
    </div>
  )
}

const DESCRIPTION_MAX = 500

export function WorkshopTemplateDetail({
  template,
  blogUrl,
  onChangeStatus,
  isUpdating,
  revisions,
  onRequestRevision,
  isRequestingRevision,
  revisionOpen,
  onRevisionOpenChange,
  navigation,
}: WorkshopTemplateDetailProps) {
  const { t } = useTranslation()

  const overlayLines = template.overlay ? template.overlay.split('\n').filter(Boolean) : []
  const design = template.design ?? {}
  const colors = design.colors ?? []
  const descriptionLength = template.description?.length ?? 0

  return (
    <div className="flex min-h-0 flex-col lg:h-full">
      {/* Fixed head: identity, prev/next, and every review action in one bar. */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-purple-100/60 pb-3 dark:border-white/5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-display text-base font-bold tabular-nums">
              #{template.position}
            </span>
            {template.pin_type && (
              <span className="truncate text-sm text-muted-foreground">{template.pin_type}</span>
            )}
            <TemplateStatusBadge status={template.status} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onChangeStatus && (
              <ArchiveAction
                status={template.status}
                onChangeStatus={onChangeStatus}
                isUpdating={isUpdating}
              />
            )}
            {navigation && (
              <>
                <span className="mr-1 text-xs tabular-nums text-muted-foreground">
                  {t('workshop.detail.positionOf', {
                    index: navigation.index + 1,
                    total: navigation.total,
                  })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={navigation.onPrev}
                  disabled={navigation.index <= 0}
                  aria-label={t('workshop.detail.previous')}
                  title={`${t('workshop.detail.previous')} (k)`}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={navigation.onNext}
                  disabled={navigation.index >= navigation.total - 1}
                  aria-label={t('workshop.detail.next')}
                  title={`${t('workshop.detail.next')} (j)`}
                >
                  <ChevronRight />
                </Button>
              </>
            )}
          </div>
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
              open={revisionOpen}
              onOpenChange={onRevisionOpenChange}
            />
          )}
          <CopyButton
            text={template.image_prompt}
            label={t('workshop.detail.copyImagePrompt')}
            shortcut="c"
            className="border-primary/30 text-primary hover:text-primary"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-7 pt-5 lg:overflow-y-auto lg:pr-1">
        {/* The pin at a glance: sketch beside the texts that land on Pinterest. */}
        <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <WorkshopPinSketch
            overlayLines={overlayLines}
            design={design}
            footer={overlayFooterDomain(blogUrl)}
          />
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-base font-bold leading-snug [text-wrap:balance]">
                {template.title ?? '—'}
              </h2>
              {template.description ? (
                <>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                    {template.description}
                  </p>
                  <p
                    className={cn(
                      'text-xs tabular-nums text-muted-foreground',
                      descriptionLength > DESCRIPTION_MAX &&
                        'font-medium text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {t('workshop.detail.descriptionLength', {
                      count: descriptionLength,
                      max: DESCRIPTION_MAX,
                    })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('workshop.detail.descriptionLater')}
                </p>
              )}
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t('workshop.detail.board')}</dt>
              <dd>{template.board_name_raw ?? '—'}</dd>
              <dt className="text-muted-foreground">{t('workshop.detail.mainKeyword')}</dt>
              <dd className="font-medium">{template.main_keyword}</dd>
              {template.season && (
                <>
                  <dt className="text-muted-foreground">{t('workshop.detail.season')}</dt>
                  <dd>{template.season}</dd>
                </>
              )}
            </dl>
          </div>
        </div>

        <Section title={t('workshop.detail.imagePrompt')}>
          <ImagePrompt text={template.image_prompt} />
        </Section>

        <Section title={t('workshop.detail.keywords')}>
          <dl className="flex flex-col gap-3 text-sm">
            <KeywordChips label={t('workshop.detail.longtails')} items={template.longtails} />
            {template.search_intent && (
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">
                  {t('workshop.detail.searchIntent')}
                </dt>
                <dd>{template.search_intent}</dd>
              </div>
            )}
            <KeywordChips
              label={t('workshop.detail.searchPhrases')}
              items={template.search_phrases}
            />
          </dl>
        </Section>

        <Section title={t('workshop.detail.designBrief')}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
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
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {colors.map((color, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span
                    data-testid="design-color"
                    className="h-5 w-5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="text-xs tabular-nums text-muted-foreground">{color}</span>
                </span>
              ))}
            </div>
          )}
        </Section>

        {template.quality_check && template.quality_check.length > 0 && (
          <Section title={t('workshop.detail.qualityCheck')}>
            <ul className="flex flex-col gap-1.5 text-sm">
              {template.quality_check.map((qc, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{qc}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section
          title={t('workshop.detail.imageIdea')}
          action={
            template.image_idea ? (
              <CopyButton
                text={template.image_idea}
                label={t('workshop.detail.copyImageIdea')}
                variant="ghost"
              />
            ) : undefined
          }
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
            {template.image_idea ?? '—'}
          </p>
        </Section>

        {/* Change history — only rendered when the caller passes revisions. */}
        {revisions !== undefined && (
          <Section title={t('workshop.detail.revisionHistory')}>
            <RevisionHistory revisions={revisions} />
          </Section>
        )}
      </div>
    </div>
  )
}
