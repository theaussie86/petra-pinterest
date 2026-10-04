import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ExternalLink } from 'lucide-react'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { useArticles, useUpdateArticleWorkshopStatus } from '@/lib/hooks/use-articles'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import {
  usePinTemplatesByArticle,
  usePinTemplateCounts,
  useUpdatePinTemplateStatus,
  usePinTemplateRevisions,
  useRequestPinTemplateRevision,
} from '@/lib/hooks/use-pin-templates'
import {
  countByWorkspace,
  nextSelectionAfterRemoval,
  workspaceForStatus,
  type WorkspaceTab,
} from '@/lib/pin-template-workspace'
import { useWorkshopKeyboard } from '@/lib/hooks/use-workshop-keyboard'
import type { PinTemplateStatus } from '@/types/pin-templates'
import type { ArticleWorkshopStatus } from '@/types/articles'
import {
  WorkshopArticleList,
  articlesInSegment,
  defaultWorkshopSelection,
  segmentOf,
  type ArticleSegment,
} from './workshop-article-list'
import { WorkshopArticleCuration } from './workshop-article-curation'
import { WorkshopTemplateList } from './workshop-template-list'
import { WorkshopTemplateTabs } from './workshop-template-tabs'
import { WorkshopTemplateDetail } from './workshop-template-detail'

interface WorkshopViewProps {
  projectId: string
}

export function WorkshopView({ projectId }: WorkshopViewProps) {
  const { t } = useTranslation()
  const { data: articles, isLoading, error } = useArticles(projectId)
  const { data: counts } = usePinTemplateCounts(projectId)
  const { data: project } = useBlogProject(projectId)
  const updateStatus = useUpdatePinTemplateStatus()
  const requestRevision = useRequestPinTemplateRevision()
  const curate = useUpdateArticleWorkshopStatus(projectId)

  const [segment, setSegment] = useState<ArticleSegment>('wanted')
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('open')
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false)

  // Pick the opening segment + article once, when the list first arrives;
  // afterwards the selection is the reviewer's.
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current || !articles || !counts) return
    initialized.current = true
    const initial = defaultWorkshopSelection(articles, counts)
    setSegment(initial.segment)
    setSelectedArticleId(initial.articleId)
  }, [articles, counts])

  const { data: templates, isLoading: templatesLoading } = usePinTemplatesByArticle(
    selectedArticleId ?? '',
  )

  // Reset the tab + template selection when the article changes.
  const handleSelectArticle = (articleId: string) => {
    setSelectedArticleId(articleId || null)
    setSelectedTemplateId(null)
    setActiveTab('open')
  }

  // Switching segments jumps to the first article there.
  const handleSegmentChange = (next: ArticleSegment) => {
    setSegment(next)
    const first = articlesInSegment(articles ?? [], counts ?? {}, next)[0]
    handleSelectArticle(first?.id ?? '')
  }

  // Curate an article. When the decision moves the selected article out of the
  // current segment, advance to the next one so the reviewer can keep deciding.
  // The toast offers undo back to the previous state and note.
  const handleCurate = (
    articleId: string,
    status: ArticleWorkshopStatus | null,
    note?: string | null,
  ) => {
    const article = (articles ?? []).find((a) => a.id === articleId)
    if (!article) return
    const previous = { status: article.workshop_status, note: article.workshop_note }
    const noteOnly = status === article.workshop_status

    const leaves =
      segmentOf({ ...article, workshop_status: status }, counts ?? {}) !== segment
    if (leaves && articleId === selectedArticleId) {
      const list = articlesInSegment(articles ?? [], counts ?? {}, segment)
      handleSelectArticle(nextSelectionAfterRemoval(list, articleId) ?? '')
    }

    curate.mutate(
      { id: articleId, status, note },
      {
        onSuccess: () => {
          if (noteOnly) {
            toast.success(t('workshop.curate.noteSaved'))
            return
          }
          toast.success(t(`workshop.curate.done.${status ?? 'reset'}`), {
            description: article.title,
            action: {
              label: t('workshop.undo'),
              onClick: () =>
                curate.mutate({ id: articleId, status: previous.status, note: previous.note }),
            },
          })
        },
      },
    )
  }

  const tabCounts = useMemo(() => countByWorkspace(templates ?? []), [templates])

  // Templates shown in the middle column: those in the active workspace tab.
  const visibleTemplates = useMemo(
    () => (templates ?? []).filter((tpl) => workspaceForStatus(tpl.status) === activeTab),
    [templates, activeTab],
  )

  // Preselect the first template of the active tab, and drop a stale selection
  // when it is no longer visible (article/tab changed, or a status change moved
  // it to another tab).
  useEffect(() => {
    if (visibleTemplates.length === 0) {
      setSelectedTemplateId(null)
      return
    }
    setSelectedTemplateId((current) =>
      current && visibleTemplates.some((tpl) => tpl.id === current)
        ? current
        : visibleTemplates[0].id,
    )
  }, [visibleTemplates])

  const selectedTemplate = visibleTemplates.find((tpl) => tpl.id === selectedTemplateId) ?? null

  // Revision history for the selected template (loads client-side on selection).
  const { data: revisions } = usePinTemplateRevisions(selectedTemplateId ?? '')

  // Record a revision request. The template moves to needs_revision (out of the
  // Freigegeben/Archiv tabs), so — as with a status change — advance the
  // selection to the next template when the current tab no longer holds it.
  const handleRequestRevision = (feedback: string) => {
    if (!selectedTemplateId) return
    if (activeTab !== 'open') {
      setSelectedTemplateId(nextSelectionAfterRemoval(visibleTemplates, selectedTemplateId))
    }
    requestRevision.mutate({ id: selectedTemplateId, feedback })
  }

  // Change the selected template's status. When the new status moves it out of
  // the current tab, advance the selection to the next template first (issue #78)
  // so the reviewer keeps working through the open queue without a manual click.
  // Every status change can be undone from its toast, so a mistyped `f` costs
  // one click instead of a hunt through the Freigegeben tab.
  const handleChangeStatus = (status: PinTemplateStatus) => {
    if (!selectedTemplate) return
    const { id, position, status: previous } = selectedTemplate
    if (workspaceForStatus(status) !== activeTab) {
      setSelectedTemplateId(nextSelectionAfterRemoval(visibleTemplates, id))
    }
    updateStatus.mutate(
      { id, status },
      {
        onSuccess: () => {
          toast.success(
            t('workshop.statusChanged', {
              position,
              status: t('pinTemplateStatus.' + status),
            }),
            {
              action: {
                label: t('workshop.undo'),
                onClick: () => updateStatus.mutate({ id, status: previous }),
              },
            },
          )
        },
      },
    )
  }

  // Keyboard review (issue #80): move through the active workspace with j/k and
  // trigger the same actions as the detail buttons with f/c/r. Shortcuts are
  // ignored while typing or a dialog is open (see useWorkshopKeyboard).
  const moveSelection = (delta: number) => {
    if (visibleTemplates.length === 0) return
    const index = visibleTemplates.findIndex((tpl) => tpl.id === selectedTemplateId)
    const currentIndex = index === -1 ? 0 : index
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), visibleTemplates.length - 1)
    setSelectedTemplateId(visibleTemplates[nextIndex].id)
  }

  const handleCopyPrompt = () => {
    if (!selectedTemplate) return
    void navigator.clipboard.writeText(selectedTemplate.image_prompt)
    toast.success(t('workshop.detail.copied'))
  }

  useWorkshopKeyboard(
    {
      onNext: () => moveSelection(1),
      onPrev: () => moveSelection(-1),
      // Approving only makes sense in the Offen workspace (mirrors the button).
      onApprove: () => {
        if (selectedTemplate && workspaceForStatus(selectedTemplate.status) === 'open') {
          handleChangeStatus('approved')
        }
      },
      onCopyPrompt: handleCopyPrompt,
      onRequestRevision: () => {
        if (selectedTemplate) setRevisionDialogOpen(true)
      },
    },
    visibleTemplates.length > 0,
  )

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorState error={error} />

  const selectedArticle = (articles ?? []).find((a) => a.id === selectedArticleId) ?? null
  const totalTemplates = (templates ?? []).length
  const selectedIndex = visibleTemplates.findIndex((tpl) => tpl.id === selectedTemplateId)

  // The middle column has four states: no article selected, templates loading,
  // the article has no templates yet (curation: want pins or not), or the
  // tabbed template list.
  const renderTemplateColumn = () => {
    if (!selectedArticle) {
      return <p className="py-4 text-sm text-muted-foreground">{t('workshop.selectArticle')}</p>
    }
    if (templatesLoading) {
      return <LoadingSpinner />
    }
    if (totalTemplates === 0) {
      return (
        <div className="min-h-0 overflow-y-auto">
          <WorkshopArticleCuration
            article={selectedArticle}
            onCurate={(status, note) => handleCurate(selectedArticle.id, status, note)}
            isSaving={curate.isPending}
          />
        </div>
      )
    }
    return (
      <>
        <WorkshopTemplateTabs activeTab={activeTab} counts={tabCounts} onTabChange={setActiveTab} />
        {visibleTemplates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {activeTab === 'open' ? t('workshop.allReviewed') : t('workshop.noTemplatesInTab')}
          </p>
        ) : (
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 max-lg:max-h-[28rem]">
            <WorkshopTemplateList
              templates={visibleTemplates}
              selectedTemplateId={selectedTemplateId}
              onSelect={setSelectedTemplateId}
            />
          </div>
        )}
        <ShortcutLegend />
      </>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[16rem_minmax(18rem,1fr)_minmax(24rem,1.35fr)] xl:grid-cols-[18rem_minmax(20rem,1fr)_minmax(28rem,1.5fr)]">
      {/* Left: articles by curation segment, with review progress */}
      <div className="flex min-h-0 flex-col border-purple-100/60 max-lg:max-h-[24rem] lg:border-r lg:pr-5 dark:border-white/5">
        <WorkshopArticleList
          articles={articles ?? []}
          counts={counts ?? {}}
          segment={segment}
          onSegmentChange={handleSegmentChange}
          selectedArticleId={selectedArticleId}
          onSelect={handleSelectArticle}
          onCurate={(id, status) => handleCurate(id, status)}
        />
      </div>

      {/* Middle: the selected article, its progress, workspace tabs + templates */}
      <div className="flex min-h-0 flex-col gap-3">
        {selectedArticle && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <h2 className="line-clamp-2 flex-1 font-display text-base font-bold leading-snug [text-wrap:balance]">
                {selectedArticle.title}
              </h2>
              <a
                href={selectedArticle.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('workshop.openArticle')}
                title={t('workshop.openArticle')}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            {totalTemplates > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                    style={{ width: `${(tabCounts.approved / totalTemplates) * 100}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t('workshop.progress', { approved: tabCounts.approved, total: totalTemplates })}
                </span>
              </div>
            )}
            {totalTemplates > 0 && selectedArticle.workshop_note && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">{t('workshop.curate.noteShort')}</span>{' '}
                {selectedArticle.workshop_note}
              </p>
            )}
          </div>
        )}
        {renderTemplateColumn()}
      </div>

      {/* Right: detail view of the selected template */}
      <div className="flex min-h-0 flex-col border-purple-100/60 lg:border-l lg:pl-6 dark:border-white/5">
        {selectedTemplate ? (
          <WorkshopTemplateDetail
            template={selectedTemplate}
            blogUrl={project?.blog_url ?? ''}
            onChangeStatus={handleChangeStatus}
            isUpdating={updateStatus.isPending}
            revisions={revisions ?? []}
            onRequestRevision={handleRequestRevision}
            isRequestingRevision={requestRevision.isPending}
            revisionOpen={revisionDialogOpen}
            onRevisionOpenChange={setRevisionDialogOpen}
            navigation={{
              index: selectedIndex,
              total: visibleTemplates.length,
              onPrev: () => moveSelection(-1),
              onNext: () => moveSelection(1),
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted-foreground">
            {selectedArticle && totalTemplates === 0 && !templatesLoading ? (
              <p className="max-w-xs text-sm">{t('workshop.detailsNoTemplates')}</p>
            ) : (
              <>
                <p className="text-sm">{t('workshop.detailsPlaceholder')}</p>
                <p className="mt-1 text-xs">{t('workshop.detailsPlaceholderHint')}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** The review shortcuts, spelled out once under the list (issue #80). */
function ShortcutLegend() {
  const { t } = useTranslation()
  const keys: [string, string][] = [
    ['j k', t('workshop.shortcuts.move')],
    ['f', t('workshop.shortcuts.approve')],
    ['c', t('workshop.shortcuts.copy')],
    ['r', t('workshop.shortcuts.revision')],
  ]
  return (
    <p className="hidden flex-wrap gap-x-3 gap-y-1 border-t border-purple-100/60 pt-2 text-xs text-muted-foreground lg:flex dark:border-white/5">
      {keys.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1">
          {key.split(' ').map((k) => (
            <kbd key={k} className="rounded border bg-background px-1 font-sans text-[10px] leading-4">
              {k}
            </kbd>
          ))}
          {label}
        </span>
      ))}
    </p>
  )
}
