import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { useArticles } from '@/lib/hooks/use-articles'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import {
  usePinTemplatesByArticle,
  usePinTemplateOpenCounts,
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
import type { PinTemplateStatus } from '@/types/pin-templates'
import { WorkshopArticleList } from './workshop-article-list'
import { WorkshopTemplateList } from './workshop-template-list'
import { WorkshopTemplateTabs } from './workshop-template-tabs'
import { WorkshopTemplateDetail } from './workshop-template-detail'

interface WorkshopViewProps {
  projectId: string
}

export function WorkshopView({ projectId }: WorkshopViewProps) {
  const { t } = useTranslation()
  const { data: articles, isLoading, error } = useArticles(projectId)
  const { data: openCounts } = usePinTemplateOpenCounts(projectId)
  const { data: project } = useBlogProject(projectId)
  const updateStatus = useUpdatePinTemplateStatus()
  const requestRevision = useRequestPinTemplateRevision()

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('open')

  // Default the selection to the first article once the list arrives; leave a
  // manual selection untouched.
  useEffect(() => {
    if (!selectedArticleId && articles && articles.length > 0) {
      setSelectedArticleId(articles[0].id)
    }
  }, [articles, selectedArticleId])

  const { data: templates, isLoading: templatesLoading } = usePinTemplatesByArticle(
    selectedArticleId ?? '',
  )

  // Reset the tab + template selection when the article changes.
  const handleSelectArticle = (articleId: string) => {
    setSelectedArticleId(articleId)
    setSelectedTemplateId(null)
    setActiveTab('open')
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
  const handleChangeStatus = (status: PinTemplateStatus) => {
    if (!selectedTemplateId) return
    if (workspaceForStatus(status) !== activeTab) {
      setSelectedTemplateId(nextSelectionAfterRemoval(visibleTemplates, selectedTemplateId))
    }
    updateStatus.mutate({ id: selectedTemplateId, status })
  }

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorState error={error} />

  // The middle column has four states: no article selected, templates loading,
  // the article has no templates at all, or the tabbed template list.
  const renderTemplateColumn = () => {
    if (!selectedArticleId) {
      return <p className="text-sm text-muted-foreground py-4">{t('workshop.selectArticle')}</p>
    }
    if (templatesLoading) {
      return <LoadingSpinner />
    }
    if ((templates ?? []).length === 0) {
      return <p className="text-sm text-muted-foreground py-4">{t('workshop.noTemplates')}</p>
    }
    return (
      <>
        <WorkshopTemplateTabs activeTab={activeTab} counts={tabCounts} onTabChange={setActiveTab} />
        {visibleTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t('workshop.noTemplatesInTab')}</p>
        ) : (
          <WorkshopTemplateList
            templates={visibleTemplates}
            selectedTemplateId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />
        )}
      </>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
      {/* Left: articles + search + open-template counts */}
      <div className="lg:border-r lg:pr-6 border-purple-100/50 dark:border-white/5">
        <WorkshopArticleList
          articles={articles ?? []}
          counts={openCounts ?? {}}
          selectedArticleId={selectedArticleId}
          onSelect={handleSelectArticle}
        />
      </div>

      {/* Middle: workspace tabs + templates of the selected article */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t('workshop.templatesHeading')}
        </h2>
        {renderTemplateColumn()}
      </div>

      {/* Right: detail view of the selected template */}
      <div className="lg:border-l lg:pl-6 border-purple-100/50 dark:border-white/5">
        {selectedTemplate ? (
          <WorkshopTemplateDetail
            template={selectedTemplate}
            blogUrl={project?.blog_url ?? ''}
            onChangeStatus={handleChangeStatus}
            isUpdating={updateStatus.isPending}
            revisions={revisions ?? []}
            onRequestRevision={handleRequestRevision}
            isRequestingRevision={requestRevision.isPending}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center h-full py-12 text-muted-foreground">
            <p className="text-sm">{t('workshop.detailsPlaceholder')}</p>
            <p className="text-xs mt-1">{t('workshop.detailsPlaceholderHint')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
