import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingSpinner } from '@/components/layout/loading-spinner'
import { ErrorState } from '@/components/layout/error-state'
import { useArticles } from '@/lib/hooks/use-articles'
import { usePinTemplatesByArticle, usePinTemplateCounts } from '@/lib/hooks/use-pin-templates'
import { WorkshopArticleList } from './workshop-article-list'
import { WorkshopTemplateList } from './workshop-template-list'

interface WorkshopViewProps {
  projectId: string
}

export function WorkshopView({ projectId }: WorkshopViewProps) {
  const { t } = useTranslation()
  const { data: articles, isLoading, error } = useArticles(projectId)
  const { data: counts } = usePinTemplateCounts(projectId)

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)

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
          onSelect={setSelectedArticleId}
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
          <WorkshopTemplateList templates={templates ?? []} />
        )}
      </div>

      {/* Right: placeholder for the future detail view */}
      <div className="lg:border-l lg:pl-6 border-purple-100/50 dark:border-white/5">
        <div className="flex flex-col items-center justify-center text-center h-full py-12 text-muted-foreground">
          <p className="text-sm">{t('workshop.detailsPlaceholder')}</p>
          <p className="text-xs mt-1">{t('workshop.detailsPlaceholderHint')}</p>
        </div>
      </div>
    </div>
  )
}
