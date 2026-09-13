import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { useArticles } from '@/lib/hooks/use-articles'
import { useBlogProject } from '@/lib/hooks/use-blog-projects'
import { usePinTemplatesByArticle, usePinTemplateCounts } from '@/lib/hooks/use-pin-templates'
import { WorkshopArticleList } from './workshop-article-list'
import { WorkshopTemplateList } from './workshop-template-list'
import { WorkshopTemplateDetail } from './workshop-template-detail'

interface WorkshopViewProps {
  projectId: string
}

export function WorkshopView({ projectId }: WorkshopViewProps) {
  const { t } = useTranslation()
  const { data: articles, isLoading, error } = useArticles(projectId)
  const { data: counts } = usePinTemplateCounts(projectId)
  const { data: project } = useBlogProject(projectId)

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

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

  // Reset the template selection when the article changes.
  const handleSelectArticle = (articleId: string) => {
    setSelectedArticleId(articleId)
    setSelectedTemplateId(null)
  }

  // Preselect the first template of the selected article, and drop a stale
  // selection when the loaded templates no longer contain it.
  useEffect(() => {
    if (!templates || templates.length === 0) {
      setSelectedTemplateId(null)
      return
    }
    setSelectedTemplateId((current) =>
      current && templates.some((tpl) => tpl.id === current) ? current : templates[0].id,
    )
  }, [templates])

  const selectedTemplate = templates?.find((tpl) => tpl.id === selectedTemplateId) ?? null

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorState error={error} />

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
      {/* Left: articles + search + template counts */}
      <div className="lg:border-r lg:pr-6 border-purple-100/50 dark:border-white/5">
        <WorkshopArticleList
          articles={articles ?? []}
          counts={counts ?? {}}
          selectedArticleId={selectedArticleId}
          onSelect={handleSelectArticle}
        />
      </div>

      {/* Middle: templates of the selected article */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t('workshop.templatesHeading')}
        </h2>
        {!selectedArticleId ? (
          <p className="text-sm text-muted-foreground py-4">{t('workshop.selectArticle')}</p>
        ) : templatesLoading ? (
          <LoadingSpinner />
        ) : (
          <WorkshopTemplateList
            templates={templates ?? []}
            selectedTemplateId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />
        )}
      </div>

      {/* Right: detail view of the selected template */}
      <div className="lg:border-l lg:pl-6 border-purple-100/50 dark:border-white/5">
        {selectedTemplate ? (
          <WorkshopTemplateDetail
            template={selectedTemplate}
            blogUrl={project?.blog_url ?? ''}
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
